import test from 'node:test';
import assert from 'node:assert/strict';
import {signPreparedTse} from '../server/tse-signing-worker.js';

const id='transaction-test';
const transaction={
  id,restaurant_id:'restaurant-test',receipt_id:'receipt-test',
  process_data:{totalsMatch:true,clientTransactionId:'client-test'}
};
const readyStatus={certified:true,serialNumber:'SERIAL-1'};
const readyDevice={certified:true,serial_number:'SERIAL-1',status:'connected'};

function mockPool({device=readyDevice,tx=transaction}={}){
  const calls=[];
  const pool={
    async query(sql,params=[]){
      calls.push({sql,params});
      if(sql.includes("state='starting'") && sql.includes('RETURNING *'))return {rows:tx?[tx]:[]};
      if(sql.includes('SELECT serial_number,certified,status'))return {rows:device?[device]:[]};
      if(sql.includes("SET state='finishing'"))return {rows:[{id}],rowCount:1};
      return {rows:[]};
    }
  };
  return {pool,calls};
}
function mockAdapter(overrides={}){
  return {
    status:async()=>readyStatus,
    startTransaction:async()=>({transactionNumber:'42',certified:true,serialNumber:'SERIAL-1',startedAt:'2026-10-16T10:00:00Z'}),
    finishTransaction:async()=>({transactionNumber:'42',certified:true,serialNumber:'SERIAL-1',signature:'signed',signatureCounter:'1',signatureAlgorithm:'ecdsa',finishedAt:'2026-10-16T10:00:01Z'}),
    ...overrides
  };
}

test('does not claim a transaction when no certified device is ready',async()=>{
  const {pool,calls}=mockPool();
  const result=await signPreparedTse(pool,id,mockAdapter({status:async()=>({certified:false,serialNumber:null})}));
  assert.deepEqual(result,{signed:false,reason:'device_not_ready'});
  assert.equal(calls.length,0);
});

test('rejects mismatched totals before calling the TSE',async()=>{
  const {pool,calls}=mockPool({tx:{...transaction,process_data:{totalsMatch:false}}});
  let started=false;
  const result=await signPreparedTse(pool,id,mockAdapter({startTransaction:async()=>{started=true;throw Error('must not start');}}));
  assert.deepEqual(result,{signed:false,reason:'total_mismatch'});
  assert.equal(started,false);
  assert.ok(calls.some(x=>x.sql.includes("error_code='TOTAL_MISMATCH'")));
});

test('keeps transaction prepared when restaurant device differs',async()=>{
  const {pool,calls}=mockPool({device:{...readyDevice,serial_number:'OTHER'}});
  const result=await signPreparedTse(pool,id,mockAdapter());
  assert.deepEqual(result,{signed:false,reason:'restaurant_device_mismatch'});
  assert.ok(calls.some(x=>x.sql.includes("state='prepared'")));
});

test('ambiguous provider outcome requires manual review and is never retried automatically',async()=>{
  const {pool,calls}=mockPool();
  let startCount=0;
  const result=await signPreparedTse(pool,id,mockAdapter({
    startTransaction:async()=>{startCount++;throw Error('connection lost after request');}
  }));
  assert.deepEqual(result,{signed:false,reason:'outcome_unconfirmed'});
  assert.equal(startCount,1);
  assert.ok(calls.some(x=>x.sql.includes("state='needs_review'")));
  assert.equal(calls.filter(x=>x.sql.includes("SET state='prepared'")).length,0);
});

test('only one worker claims an already-claimed transaction',async()=>{
  const {pool}=mockPool({tx:null});
  const result=await signPreparedTse(pool,id,mockAdapter());
  assert.deepEqual(result,{signed:false,reason:'already_claimed'});
});

test('successful TSE signing commits signed receipt and releases database connection',async()=>{
 const {pool,calls}=mockPool();
 let released=false;
 pool.connect=async()=>({
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes("state='signed'") && sql.includes('RETURNING *'))return {rows:[{
    state:'signed',tse_transaction_number:'42',tse_serial_number:'SERIAL-1',
    signature_counter:'1',signature_algorithm:'ecdsa',signature:'signed'
   }]};
   return {rows:[],rowCount:1};
  },
  release(){released=true;}
 });
 const result=await signPreparedTse(pool,id,mockAdapter());
 assert.deepEqual(result,{signed:true});
 assert.equal(released,true);
 assert.ok(calls.some(x=>x.sql==='COMMIT'));
 assert.ok(calls.some(x=>x.sql.includes("UPDATE receipts SET fiscal_status='signed'")));
 assert.equal(calls.filter(x=>x.sql==='ROLLBACK').length,0);
});

test('missing signed transaction rolls back and requires manual review',async()=>{
 const {pool,calls}=mockPool();
 let released=false;
 pool.connect=async()=>({
  async query(sql,params=[]){
   calls.push({sql,params});
   return {rows:[],rowCount:0};
  },
  release(){released=true;}
 });
 const result=await signPreparedTse(pool,id,mockAdapter());
 assert.deepEqual(result,{signed:false,reason:'outcome_unconfirmed'});
 assert.equal(released,true);
 assert.ok(calls.some(x=>x.sql==='ROLLBACK'));
 assert.ok(calls.some(x=>x.sql.includes("state='needs_review'")));
 assert.equal(calls.filter(x=>x.sql.includes("UPDATE receipts SET fiscal_status='signed'")).length,0);
});

test('missing receipt rolls back the fiscal signature transaction',async()=>{
 const {pool,calls}=mockPool();
 let released=false;
 pool.connect=async()=>({
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes("state='signed'") && sql.includes('RETURNING *'))return {rows:[{
    state:'signed',tse_transaction_number:'42',tse_serial_number:'SERIAL-1',
    signature_counter:'1',signature_algorithm:'ecdsa',signature:'signed'
   }],rowCount:1};
   if(sql.includes('UPDATE receipts SET'))return {rows:[],rowCount:0};
   return {rows:[],rowCount:1};
  },
  release(){released=true;}
 });
 const result=await signPreparedTse(pool,id,mockAdapter());
 assert.deepEqual(result,{signed:false,reason:'outcome_unconfirmed'});
 assert.equal(released,true);
 assert.ok(calls.some(x=>x.sql==='ROLLBACK'));
 assert.equal(calls.filter(x=>x.sql==='COMMIT').length,0);
 assert.ok(calls.some(x=>x.sql.includes("state='needs_review'")));
});

test('TSE accepts transaction number zero when device confirms it',async()=>{
 const {pool,calls}=mockPool();
 pool.connect=async()=>({
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql.includes("state='signed'") && sql.includes('RETURNING *'))return {rows:[{
    state:'signed',tse_transaction_number:'0',tse_serial_number:'SERIAL-1',
    signature_counter:'1',signature_algorithm:'ecdsa',signature:'signed'
   }],rowCount:1};
   return {rows:[],rowCount:1};
  },
  release(){}
 });
 const result=await signPreparedTse(pool,id,mockAdapter({
  startTransaction:async()=>({transactionNumber:0,certified:true,serialNumber:'SERIAL-1',startedAt:'2026-10-16T10:00:00Z'}),
  finishTransaction:async()=>({transactionNumber:0,certified:true,serialNumber:'SERIAL-1',signature:'signed',signatureCounter:'1',signatureAlgorithm:'ecdsa',finishedAt:'2026-10-16T10:00:01Z'})
 }));
 assert.deepEqual(result,{signed:true});
 assert.ok(calls.some(x=>x.sql.includes("state='finishing'")&&x.params.includes('0')));
});

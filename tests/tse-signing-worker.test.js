import test from 'node:test';
import assert from 'node:assert/strict';
import {signPreparedTse} from '../server/tse-signing-worker.js';

function fixture({startFails=false,finishFails=false,totalsMatch=true}={}){
 const calls=[];
 const transaction={id:'tx',restaurant_id:'restaurant',receipt_id:'receipt',process_data:{totalsMatch}};
 const signed={...transaction,state:'signed',tse_transaction_number:'42',tse_serial_number:'serial',signature_counter:'1',signature_algorithm:'ecdsa',log_time_format:'unixTime',started_at:'2026-10-16T08:00:00Z',finished_at:'2026-10-16T08:01:00Z',signature:'signature',public_key:'public'};
 const query=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes("state='starting'"))return {rows:[transaction]};
  if(sql.includes('SELECT serial_number,certified,status FROM tse_devices'))return {rows:[{serial_number:'serial',certified:true,status:'connected'}]};
  if(sql.includes("state='signed'"))return {rows:[signed]};
  if(sql.startsWith('UPDATE receipts'))return {rowCount:1,rows:[]};
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){calls.push({sql:'RELEASE'})}})};
 const adapter={
  status:async()=>({certified:true,serialNumber:'serial'}),
  startTransaction:async()=>{if(startFails)throw Error('bridge unavailable');return {transactionNumber:'42',certified:true,serialNumber:'serial',startedAt:'2026-10-16T08:00:00Z'};},
  finishTransaction:async()=>{if(finishFails)throw Error('uncertain finish');return {transactionNumber:'42',certified:true,serialNumber:'serial',signature:'signature',signatureCounter:'1',signatureAlgorithm:'ecdsa',finishedAt:'2026-10-16T08:01:00Z',publicKey:'public'};}
 };
 return {pool,adapter,calls};
}

test('successful signature commits signed receipt',async()=>{
 const f=fixture();
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:true});
 assert.ok(f.calls.some(x=>x.sql==='COMMIT'));
 assert.ok(f.calls.some(x=>x.sql.includes("fiscal_status='signed'")));
});
test('start failure flags outcome for review, without retry',async()=>{
 const f=fixture({startFails:true});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.ok(f.calls.some(x=>x.sql.includes("state='needs_review'")));
 assert.ok(!f.calls.some(x=>x.sql.includes("fiscal_status='signed'")));
});
test('finish failure does not issue signed receipt',async()=>{
 const f=fixture({finishFails:true});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.ok(!f.calls.some(x=>x.sql.includes("fiscal_status='signed'")));
});
test('payment mismatch blocks signing',async()=>{
 const f=fixture({totalsMatch:false});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'total_mismatch'});
 assert.ok(f.calls.some(x=>x.sql.includes('TOTAL_MISMATCH')));
});

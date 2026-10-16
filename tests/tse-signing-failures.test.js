import test from 'node:test';
import assert from 'node:assert/strict';
import {signPreparedTse} from '../server/tse-signing-worker.js';

function setup({claimed=true,commitFails=false,receiptFails=false,rollbackFails=false,receiptMissing=false}={}){
 const events=[];
 let starts=0,finishes=0;
 const tx={id:'tx',restaurant_id:'r',receipt_id:'receipt',process_data:{totalsMatch:true}};
 const signed={...tx,state:'signed',tse_transaction_number:'42',tse_serial_number:'serial',signature_counter:'1',signature_algorithm:'ecdsa',signature:'sig',started_at:'2026-10-16T08:00:00Z',finished_at:'2026-10-16T08:01:00Z'};
 async function query(sql){
  events.push(sql);
  if(sql.includes("state='starting'")&&sql.includes('RETURNING *'))return {rows:claimed?[tx]:[]};
  if(sql.startsWith('SELECT serial_number'))return {rows:[{serial_number:'serial',certified:true,status:'connected'}]};
  if(sql.includes("state='signed'")&&sql.includes('RETURNING *'))return {rows:[signed]};
  if(sql.startsWith("UPDATE receipts")){if(receiptFails)throw Error('receipt write failed');return {rowCount:receiptMissing?0:1,rows:[]};}
  if(sql==='COMMIT'&&commitFails)throw Error('commit outcome unknown');
  if(sql==='ROLLBACK'&&rollbackFails)throw Error('rollback unavailable');
  return {rows:[]};
 }
 const pool={query,connect:async()=>({query,release(){events.push('RELEASE')}})};
 const adapter={
  status:async()=>({certified:true,serialNumber:'serial'}),
  startTransaction:async()=>{starts++;return {transactionNumber:'42',certified:true,serialNumber:'serial',startedAt:'2026-10-16T08:00:00Z'};},
  finishTransaction:async()=>{finishes++;return {transactionNumber:'42',certified:true,serialNumber:'serial',signature:'sig',signatureCounter:'1',signatureAlgorithm:'ecdsa',finishedAt:'2026-10-16T08:01:00Z'};}
 };
 return {pool,adapter,events,get starts(){return starts},get finishes(){return finishes}};
}

test('already claimed transaction never touches hardware',async()=>{
 const f=setup({claimed:false});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'already_claimed'});
 assert.equal(f.starts,0);
 assert.equal(f.finishes,0);
});
test('receipt database failure rolls back and requires review',async()=>{
 const f=setup({receiptFails:true});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.ok(f.events.includes('ROLLBACK'));
 assert.ok(f.events.some(sql=>sql.includes("state='needs_review'")));
 assert.equal(f.starts,1);
 assert.equal(f.finishes,1);
});
test('uncertain commit never retries hardware signing',async()=>{
 const f=setup({commitFails:true});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.equal(f.starts,1);
 assert.equal(f.finishes,1);
 assert.ok(f.events.some(sql=>sql.includes("state='needs_review'")));
});

test('rollback failure still marks signing outcome for review',async()=>{
 const f=setup({receiptFails:true,rollbackFails:true});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.ok(f.events.includes('ROLLBACK'));
 assert.ok(f.events.some(sql=>sql.includes("state='needs_review'")));
 assert.equal(f.starts,1);
 assert.equal(f.finishes,1);
});

test('missing receipt prevents commit and requires review',async()=>{
 const f=setup({receiptMissing:true});
 assert.deepEqual(await signPreparedTse(f.pool,'tx',f.adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.ok(f.events.includes('ROLLBACK'));
 assert.ok(!f.events.includes('COMMIT'));
 assert.ok(f.events.some(sql=>sql.includes("state='needs_review'")));
 assert.equal(f.starts,1);
 assert.equal(f.finishes,1);
});

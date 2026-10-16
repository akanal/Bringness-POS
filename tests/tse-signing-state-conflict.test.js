import test from 'node:test';
import assert from 'node:assert/strict';
import {signPreparedTse} from '../server/tse-signing-worker.js';

test('rejected signed transition rolls back without signing receipt',async()=>{
 const sql=[];
 let starts=0,finishes=0;
 const tx={id:'tx',restaurant_id:'restaurant',receipt_id:'receipt',process_data:{totalsMatch:true}};
 const query=async(statement)=>{
  sql.push(statement);
  if(statement.includes("state='starting'")&&statement.includes('RETURNING *'))return {rows:[tx]};
  if(statement.startsWith('SELECT serial_number'))return {rows:[{serial_number:'serial',certified:true,status:'connected'}]};
  if(statement.includes("state='signed'")&&statement.includes('RETURNING *'))return {rows:[]};
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const adapter={
  status:async()=>({certified:true,serialNumber:'serial'}),
  startTransaction:async()=>{starts++;return {certified:true,serialNumber:'serial',transactionNumber:'42',startedAt:'2026-10-16T08:00:00Z'};},
  finishTransaction:async()=>{finishes++;return {certified:true,serialNumber:'serial',transactionNumber:'42',signature:'signature',signatureCounter:'1',signatureAlgorithm:'ecdsa',finishedAt:'2026-10-16T08:01:00Z'};}
 };
 assert.deepEqual(await signPreparedTse(pool,'tx',adapter),{signed:false,reason:'outcome_unconfirmed'});
 assert.equal(starts,1);
 assert.equal(finishes,1);
 assert.ok(sql.includes('ROLLBACK'));
 assert.ok(!sql.some(s=>s.includes("fiscal_status='signed'")));
 assert.ok(sql.some(s=>s.includes("state='needs_review'")));
});

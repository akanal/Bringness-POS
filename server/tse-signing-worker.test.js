import test from 'node:test';
import assert from 'node:assert/strict';
import {processPreparedTse} from './tse-signing-worker.js';

test('a broken restaurant bridge does not prevent another restaurant from signing',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT id,restaurant_id'))return {rows:[{id:'broken',restaurant_id:'one'},{id:'good',restaurant_id:'two'}]};
  if(sql.includes("SET state='starting'"))return {rows:[{id:args[0],restaurant_id:'two',receipt_id:'receipt',process_data:{totalsMatch:true}}]};
  if(sql.startsWith('SELECT serial_number'))return {rows:[{serial_number:'serial-two',certified:true,status:'connected'}]};
  if(sql.includes("state='signed'"))return {rows:[{state:'signed',tse_transaction_number:'7',signature:'signed-proof'}]};
  return {rows:[]};
 },connect:async()=>({query:(...args)=>pool.query(...args),release(){}})};
 const outcomes=await processPreparedTse(pool,async restaurantId=>{
  if(restaurantId==='one')throw Error('bridge configuration unavailable');
  return {
   status:async()=>({certified:true,serialNumber:'serial-two'}),
   startTransaction:async()=>({certified:true,serialNumber:'serial-two',transactionNumber:'7',startedAt:'2026-10-06T12:00:00Z'}),
   finishTransaction:async()=>({certified:true,serialNumber:'serial-two',transactionNumber:'7',signature:'signed-proof',signatureCounter:'1',signatureAlgorithm:'test',finishedAt:'2026-10-06T12:01:00Z'})
  };
 });
 assert.deepEqual(outcomes,[{id:'broken',signed:false,reason:'processing_failed'},{id:'good',signed:true}]);
 assert.equal(calls.some(c=>c.sql.includes("fiscal_status='signed'")),true);
 assert.equal(calls.some(c=>c.args?.[0]==='broken'),false);
});

test('an ambiguous signing response is not retried and the batch continues',async()=>{
 let starts=0,finishes=0;const states=new Map([['uncertain','prepared'],['next','prepared']]);
 const pool={query:async(sql,args)=>{
  if(sql.startsWith('SELECT id,restaurant_id'))return {rows:[...states].filter(([,s])=>s==='prepared').map(([id])=>({id,restaurant_id:id}))};
  if(sql.includes("SET state='starting'")){states.set(args[0],'starting');return {rows:[{id:args[0],restaurant_id:args[0],process_data:{totalsMatch:true}}]};}
  if(sql.startsWith('SELECT serial_number'))return {rows:[{serial_number:args[0],certified:true,status:'connected'}]};
  if(sql.includes("SET state='finishing'"))states.set(args[0],'finishing');
  if(sql.includes("SET state='needs_review'"))states.set(args[0],'needs_review');
  return {rows:[]};
 }};
 const adapters=async id=>({
  status:async()=>({certified:id==='uncertain',serialNumber:id}),
  startTransaction:async()=>{starts++;return {certified:true,serialNumber:id,transactionNumber:'7',startedAt:'2026-10-06T12:00:00Z'};},
  finishTransaction:async()=>{finishes++;throw Error('lost hardware reply');}
 });
 const outcomes=await processPreparedTse(pool,adapters);
 assert.deepEqual(outcomes,[{id:'uncertain',signed:false,reason:'outcome_unconfirmed'},{id:'next',signed:false,reason:'device_not_ready'}]);
 await processPreparedTse(pool,adapters);
 assert.equal(states.get('uncertain'),'needs_review');assert.equal(starts,1);assert.equal(finishes,1);
});

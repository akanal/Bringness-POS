import test from 'node:test';
import assert from 'node:assert/strict';
import {processOfflineStock} from './offline-stock.js';

test('historical offline sales retain the original POS timestamp across stock retries',async()=>{
 const originalTime='2026-09-16T10:15:00.000Z',events=[];
 let state='pending',loseAck=true;
 const query=async(sql)=>{
  if(sql.startsWith('SELECT s.id'))return {rows:state==='pending'?[{id:'offline',order_id:'order',restaurant_id:'restaurant',company_id:'company',paid_time:originalTime}]:[]};
  if(sql.startsWith('SELECT stock_state'))return {rows:[{stock_state:state}]};
  if(sql.startsWith('SELECT 1 FROM users'))return {rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT product_id'))return {rows:[{product_id:'dish',quantity:'2'}]};
  if(sql.includes("SET stock_state='applied'")){
   if(loseAck){loseAck=false;throw Error('local acknowledgement lost');}
   state='applied';
  }
  return {rows:[],rowCount:1};
 };
 const pos={query,connect:async()=>({query,release(){}})},ai={query:async()=>({rows:[{id:'connector',account_id:'buyer',consumption_mode:'sales'}]})};
 const ingest=async(_link,event)=>events.push(event);
 await processOfflineStock(pos,ai,()=>assert.fail('sales must not reserve ingredients'),ingest);
 assert.equal(state,'pending');
 await processOfflineStock(pos,ai,()=>assert.fail('sales must not reserve ingredients'),ingest);
 assert.equal(state,'applied');assert.equal(events.length,2);
 assert.deepEqual(events[0],events[1]);
 assert.deepEqual(events[0],{eventId:'pos:order',type:'sale',occurredAt:originalTime,items:[{productCode:'dish',quantity:2}]});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {processOfflineStock} from './offline-stock.js';
import {processPosStockCommands} from './pos-stock-bridge-core.js';
import {stockFailureMessage,permanentStockFailure} from './stock-retry-policy.js';

for(const worker of [processOfflineStock,processPosStockCommands]){
 test(`${worker.name}: releases single pool client before diagnostics and continues after failures`,async()=>{
  let held=false,connections=0,diagnostics=0,discarded=0;
  const pos={query:async sql=>{
   assert.equal(held,false,'pool diagnostic must not wait for its own client');
   if(sql.startsWith('SELECT'))return {rows:[{id:'a',order_id:'oa'},{id:'b',order_id:'ob'}]};
   diagnostics++;throw Error('diagnostic unavailable');
  },connect:async()=>{connections++;held=true;return {query:async sql=>{if(sql==='ROLLBACK')throw Error('broken rollback');throw null;},release:error=>{assert(error);discarded++;held=false;}}}};
  await assert.rejects(worker(pos,{},()=>{},()=>{}),AggregateError);
  assert.equal(connections,2);assert.equal(diagnostics,2);assert.equal(discarded,2);assert.equal(held,false);
 });
}

test('committed command survives connector diagnostic failure without rollback or retry',async()=>{
 let applied=false,rollbacks=0,retries=0,released=0;
 const cmd={id:'cmd',account_id:'account',created_at:new Date(),action:'start',target_status:'preparing'};
 const query=async sql=>{
  if(sql==='ROLLBACK')rollbacks++;
  if(sql.startsWith('SELECT o.*'))return {rows:[{id:'order',restaurant_id:'restaurant',company_id:'company'}]};
  if(sql.startsWith('SELECT * FROM pos_stock_commands'))return {rows:[cmd]};
  if(sql.includes('SELECT 1 FROM users'))return {rowCount:1};
  if(sql.includes("SET state='applied'"))applied=true;
  return {rows:[],rowCount:1};
 };
 const pos={query:async sql=>{if(sql.startsWith('SELECT'))return {rows:[{id:'cmd',order_id:'order'}]};retries++;},connect:async()=>({query,release(){released++;}})};
 const ai={query:async sql=>{if(sql.startsWith('UPDATE'))throw Error('diagnostic failure');return {rows:[{id:'link',account_id:'account'}]};}};
 await assert.rejects(processPosStockCommands(pos,ai,async()=>{}),AggregateError);
 assert.equal(applied,true);assert.equal(rollbacks,0);assert.equal(retries,0);assert.equal(released,1);
});

test('retry policy handles malformed errors and preserves temporary access failures',()=>{
 for(const e of [null,undefined,{},''])assert(stockFailureMessage(e).length>0);
 assert.equal(stockFailureMessage('x'.repeat(600)).length,500);
 for(const status of [401,403,408,425,429,503])assert.equal(permanentStockFailure({status}),false);
 assert.equal(permanentStockFailure({status:409}),true);
});

const source=fs.readFileSync(new URL('../apps/web/public/pos/app.js',import.meta.url),'utf8');
const pollSource=source.slice(source.indexOf('async function waitForStockCommand'),source.indexOf('async function api('));
function polling(fetch){
 let now=0,sequence=0;const timers=new Map();
 const context=vm.createContext({fetch,AbortController,encodeURIComponent,Error,Object,Number,Math,Date:class extends Date{static now(){return now;}},setTimeout(fn,delay){const id=++sequence;timers.set(id,true);queueMicrotask(()=>{if(timers.delete(id)){now+=delay;fn();}});return id;},clearTimeout(id){timers.delete(id);}});
 return vm.runInContext(pollSource+';waitForStockCommand',context);
}
test('POS polling respects future retry without sending another request',async()=>{
 const poll=polling(()=>assert.fail('no request before future retry'));
 await assert.rejects(poll({commandId:'stable',retryAfter:new Date(60000).toISOString()},{}),e=>e.pending&&e.commandId==='stable');
});
test('POS polling aborts a stalled fetch and retains the original command',async()=>{
 let requests=0;const poll=polling((url,options)=>{requests++;assert.equal(url,'/api/v1/stock-commands/stable');assert.equal(options.method,undefined);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('timeout'),{name:'AbortError'}))));});
 await assert.rejects(poll({commandId:'stable'},{}),e=>e.pending&&e.commandId==='stable');assert.equal(requests,1);
});
test('POS polling rejects a confirmation for another command',async()=>{
 const poll=polling(async()=>({ok:true,status:200,json:async()=>({commandId:'other',pending:false})}));
 await assert.rejects(poll({commandId:'stable'},{}),e=>e.pending&&e.commandId==='stable');
});

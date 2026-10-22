import test from 'node:test';
import assert from 'node:assert/strict';
import {stockUnits,aggregateIngredients,replenishment} from './ai-stock-lifecycle-core.js';
import {requestPosStockAction,syncPosStockAvailability,processPosStockCommands} from './pos-stock-bridge-core.js';
test('ingredients reject nondecimal and excess-precision quantities',()=>{for(const quantity of ['0x10','1e2','1.0001'])assert.throws(()=>aggregateIngredients([{stockId:'a',quantity,portions:1}]));assert.deepEqual(aggregateIngredients([{stockId:'a',quantity:'0.125',portions:'2'}]),[{stockId:'a',quantity:.25}]);});
test('procurement rejects nondecimal and excessive-precision demand',()=>{for(const incoming of ['0x10','1e2','0.0001'])assert.throws(()=>replenishment({quantity:1,minimum:2},{incoming}));});
test('negative physical stock remains supported with decimal validation',()=>{assert.equal(replenishment({quantity:'-1.125',minimum:2}).shortage,2);for(const quantity of ['-0x10','1e2',.0001])assert.throws(()=>replenishment({quantity,minimum:2}));});
test('procurement refuses target below configured minimum',()=>{assert.throws(()=>replenishment({quantity:1,minimum:3,target_quantity:2}));assert.equal(replenishment({quantity:1,minimum:3,target_quantity:3}).shortage,2);});
test('procurement uses integer units without phantom rounding shortages',()=>{assert.equal(replenishment({quantity:.7,minimum:1,target_quantity:1},{incoming:.2,pending:.1}).shortage,0);assert.equal(replenishment({quantity:.7,minimum:1,target_quantity:1},{incoming:.2,pending:.099}).shortage,.001);});
test('stock action rejects inherited status names before write access',async()=>{for(const status of ['constructor','toString','__proto__',null,{}])await assert.rejects(requestPosStockAction({connect(){assert.fail('unexpected write')}},{role:'owner'},'11111111-1111-4111-8111-111111111111',{status}),e=>e.status===400);});
test('stock reasons reject coercion and oversized payloads before connection',async()=>{for(const reason of [{},true,1,'x'.repeat(501)])await assert.rejects(requestPosStockAction({connect(){assert.fail('unexpected write')}},{role:'owner'},'11111111-1111-4111-8111-111111111111',{status:'preparing',reason}),e=>e.status===400);});
test('availability projection rechecks active owner authority in its write',async()=>{let checked=false;await syncPosStockAvailability({query:async(sql,args)=>{assert.match(sql,/u.id=\$6/);assert.match(sql,/u.status='active'/);assert.equal(args[5],'owner');checked=true;}},{query:async()=>({rows:[{pos_user_id:'owner'}]})},async()=>[]);assert(checked);});

test('revoked restaurant ownership prevents an AI command',async()=>{
 let aiWrites=0,diagnostics=0;
 const query=async sql=>{
  if(sql.startsWith('SELECT o.*'))return {rows:[{id:'order',restaurant_id:'restaurant',company_id:'company'}]};
  if(sql.startsWith('SELECT id FROM restaurants'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:0};
 };
 const pos={query:async sql=>{if(sql.startsWith('SELECT'))return {rows:[{id:'command',order_id:'order'}]};diagnostics++;return {rowCount:1};},connect:async()=>({query,release(){}})};
 await processPosStockCommands(pos,{query(){assert.fail('AI must not be contacted')}},async()=>{aiWrites++});
 assert.equal(aiWrites,0);assert.equal(diagnostics,1);
});

test('offline processing uses ownership reread after the sale lock',async()=>{
 const {processOfflineStock}=await import('./offline-stock.js');
 let checked=false,reported=false;
 const query=async(sql,args)=>{
  if(sql.startsWith('SELECT stock_state'))return {rows:[{stock_state:'pending'}]};
  if(sql.startsWith('SELECT o.restaurant_id'))return {rows:[{restaurant_id:'current-restaurant',company_id:'current-company',paid_time:'2026-10-21T12:00:00Z'}]};
  if(sql.startsWith('SELECT id FROM restaurants')){assert.deepEqual(args,['current-restaurant','current-company']);checked=true;return {rowCount:0,rows:[]};}
  return {rows:[],rowCount:0};
 };
 const pos={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:[{id:'sale',order_id:'order',restaurant_id:'stale-restaurant',company_id:'stale-company'}]};assert.equal(args[1],'conflict');reported=true;return {rowCount:1};},connect:async()=>({query,release(){}})};
 await processOfflineStock(pos,{query(){assert.fail('ownership mismatch must not reach AI')}},()=>assert.fail('no reservation'),()=>assert.fail('no sale'));
 assert(checked);assert(reported);
});

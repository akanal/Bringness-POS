import {kitchenRoutes} from './ai-stock-lifecycle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from './ai-stock-lifecycle-core.js';

test('signed physical balances retain precision while rejecting malformed and excessive quantities',()=>{
 assert.equal(core.signedStockUnits('-0.125'),-125);assert.equal(core.signedStockUnits(-1.001),-1001);assert.equal(core.signedStockUnits('0.001'),1);
 for(const value of ['-0x10','-1e2','--1','-0.0001',NaN,Infinity,-Infinity,-1000000001,{},null])assert.throws(()=>core.signedStockUnits(value));
});

test('ingredient products round upwards exactly even at high decimal boundaries',()=>{
 for(const [quantity,portions,expected] of [['0.001','0.001',0.001],['999999.999','999.999',999998999.001],['0.333','3',0.999],['12345.678','0.007',86.420]]){
  assert.equal(core.aggregateIngredients([{stockId:'ingredient',quantity,portions}])[0].quantity,expected);
 }
 assert.throws(()=>core.aggregateIngredients([{stockId:'ingredient',quantity:1000000000,portions:1000000000}]));
});

test('reservation uses exact free units and rejects invalid physical or reserved balances',()=>{
 assert.deepEqual(core.reserveStock({quantity:'0.3',reserved_quantity:'0.1'},'0.2'),{reserved:0.3});
 assert.throws(()=>core.reserveStock({quantity:'0.299',reserved_quantity:'0.1'},'0.2'),e=>e.status===409);
 for(const stock of [{quantity:'NaN',reserved_quantity:0},{quantity:1,reserved_quantity:-1},{quantity:-1,reserved_quantity:0}])assert.throws(()=>core.reserveStock(stock,0.001));
});

test('preparation and cancellation release exact reservations and preserve physical stock on cancellation',()=>{
 const stock={quantity:'0.3',reserved_quantity:'0.3'};
 assert.deepEqual(core.releaseReservedStock(stock,0.1,'start'),{reserved:0.2,before:0.3,quantity:0.2,consumed:0.1});
 assert.deepEqual(core.releaseReservedStock(stock,0.1,'cancel'),{reserved:0.2,before:0.3,quantity:0.3,consumed:0});
 assert.throws(()=>core.releaseReservedStock({quantity:1,reserved_quantity:0.099},0.1,'start'));
 assert.throws(()=>core.releaseReservedStock({quantity:0.099,reserved_quantity:0.1},0.1,'start'));
});

test('partial ingredient returns reach the original allowance exactly and reject excess or overflow',()=>{
 const first=core.returnConsumedStock({quantity:0},0.3,0,0.1);
 const second=core.returnConsumedStock({quantity:first.quantity},0.3,first.returned,0.2);
 assert.equal(second.quantity,0.3);assert.equal(second.returned,0.3);
 assert.throws(()=>core.returnConsumedStock({quantity:0.3},0.3,0.3,0.001));
 assert.throws(()=>core.returnConsumedStock({quantity:1000000000},1,0,0.001));
 assert.throws(()=>core.returnConsumedStock({quantity:1},1,'NaN',0.1));
 assert.equal(core.returnConsumedStock({quantity:-0.2},1,0,0.1).quantity,-0.1);
});

test('a suspended account cannot release a blocked recipe using an earlier authenticated actor',async()=>{
 const statements=[];let released=false;
 const pool={connect:async()=>({query:async sql=>{statements.push(sql);return {rows:[]}},release(){released=true}})};
 await assert.rejects(kitchenRoutes(pool,'/api/ai/recipe-release','POST',{id:'11111111-1111-4111-8111-111111111111'},{id:'account',role:'restaurant'}),e=>e.status===403);
 assert.equal(statements.some(sql=>sql.startsWith('UPDATE')),false);assert.equal(statements.at(-1),'ROLLBACK');assert(released);
});

test('internally derived demand rounds up to stock precision without rejecting repeating daily averages',()=>{
 assert.equal(core.roundPlannedStockUp(1/28),0.036);assert.equal(core.roundPlannedStockUp(0.1+0.2),0.3);
 assert.equal(core.roundPlannedStockUp(1.2340001),1.235);assert.equal(core.roundPlannedStockUp(1000000000),1000000000);
 for(const value of [NaN,Infinity,-1,'0.1',1000000001])assert.throws(()=>core.roundPlannedStockUp(value));
 assert.throws(()=>core.stockUnits(1/28));
});

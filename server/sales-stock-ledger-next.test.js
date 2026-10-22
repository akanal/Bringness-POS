import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateSaleIngredients,applyStockDelta} from './ai-stock-lifecycle-core.js';

test('sales round combined ingredient use once and retain negative half-unit rounding',()=>{
 assert.deepEqual(aggregateSaleIngredients([{stockId:'a',quantity:'0.001',portions:'0.5'}]),[{stockId:'a',delta:0}]);
 assert.deepEqual(aggregateSaleIngredients([{stockId:'a',quantity:'0.001',portions:'0.501'}]),[{stockId:'a',delta:-0.001}]);
 assert.deepEqual(aggregateSaleIngredients([{stockId:'a',quantity:'0.001',portions:'0.3'},{stockId:'a',quantity:'0.001',portions:'0.3'}]),[{stockId:'a',delta:-0.001}]);
 assert.deepEqual(aggregateSaleIngredients([{stockId:'b',quantity:'0.125',portions:2},{stockId:'a',quantity:'0.2',portions:3}]),[{stockId:'a',delta:-0.6},{stockId:'b',delta:-0.25}]);
});
test('sales aggregation rejects malformed quantities and combined consumption beyond the bound',()=>{
 for(const value of ['NaN',Infinity,-1,0,'1e2','0.0001'])assert.throws(()=>aggregateSaleIngredients([{stockId:'a',quantity:value,portions:1}]));
 assert.throws(()=>aggregateSaleIngredients([{stockId:'a',quantity:1000000000,portions:2}]));
});
test('stock deltas preserve exact balances, support historical deficits and reject corruption or overflow',()=>{
 assert.equal(applyStockDelta('0.3',-0.1),0.2);assert.equal(applyStockDelta('-0.2',0.1),-0.1);
 assert.equal(applyStockDelta(0,-0.001),-0.001);
 for(const [q,d]of [['NaN',1],[Infinity,1],[0,'0.0001'],[1000000000,0.001],[-1000000000,-0.001]])assert.throws(()=>applyStockDelta(q,d));
});

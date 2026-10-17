import {test} from 'node:test';import assert from 'node:assert/strict';import {stockUnits,aggregateIngredients,replenishment} from './ai-stock-lifecycle-core.js';
test('stock quantities refuse object coercion and nondecimal forms',()=>{
 for(const value of [[],[1],{},true,null,' ','0x10','1e2'])assert.throws(()=>stockUnits(value));assert.equal(stockUnits('1.125'),1125);assert.equal(stockUnits(0),0);
});

test('ingredient aggregation bounds cumulative demand and rejects malformed lines',()=>{
 for(const lines of [null,[null],[{stockId:'a',quantity:true,portions:1}],[{stockId:'a',quantity:1000000000,portions:1},{stockId:'a',quantity:1,portions:1}]])assert.throws(()=>aggregateIngredients(lines));
 assert.deepEqual(aggregateIngredients([{stockId:'a',quantity:.1,portions:2},{stockId:'a',quantity:.2,portions:1}]),[{stockId:'a',quantity:.4}]);
});

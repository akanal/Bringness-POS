import {test} from 'node:test';import assert from 'node:assert/strict';import {stockUnits,aggregateIngredients,replenishment} from './ai-stock-lifecycle-core.js';
test('stock quantities refuse object coercion and nondecimal forms',()=>{
 for(const value of [[],[1],{},true,null,' ','0x10','1e2'])assert.throws(()=>stockUnits(value));assert.equal(stockUnits('1.125'),1125);assert.equal(stockUnits(0),0);
});

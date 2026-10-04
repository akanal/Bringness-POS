import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeCost} from './ai-recipe-cost-core.js';
test('fractional quantities round only after summing',()=>{
 assert.equal(recipeCost([{quantity:.1,unit_cents:104},{quantity:.1,unit_cents:104}]).netCents,21);
});
test('missing prices do not produce a complete cost',()=>{
 const result=recipeCost([{stock_id:'a',quantity:1,unit_cents:null},{stock_id:'b',quantity:2,unit_cents:50}]);
 assert.equal(result.netCents,null);assert.equal(result.knownNetCents,100);assert.deepEqual(result.missingStockIds,['a']);
});
test('free ingredients are valid, empty recipes are incomplete',()=>{
 assert.equal(recipeCost([{quantity:1,unit_cents:0}]).netCents,0);
 assert.equal(recipeCost([]).complete,false);
});

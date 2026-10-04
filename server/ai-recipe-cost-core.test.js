import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeCost,purchaseEstimate} from './ai-recipe-cost-core.js';
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
test('purchase estimates use fractional units and retain incomplete subtotal',()=>{
 const r=purchaseEstimate([{stockId:'a',suggestedQuantity:1.25,unitCents:120},{stockId:'b',suggestedQuantity:2,unitCents:null}]);
 assert.equal(r.items[0].estimatedNetCents,150);assert.equal(r.netCents,null);assert.equal(r.knownNetCents,150);assert.deepEqual(r.missingStockIds,['b']);
});
test('no shortage needs no price, free goods remain valid',()=>{
 const r=purchaseEstimate([{stockId:'a',suggestedQuantity:0,unitCents:null},{stockId:'b',suggestedQuantity:3,unitCents:0}]);
 assert.equal(r.complete,true);assert.equal(r.netCents,0);assert.throws(()=>purchaseEstimate([{suggestedQuantity:-1}]));
});

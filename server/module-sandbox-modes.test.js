import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateModulePurchase} from './module-sandbox.js';

const modes=['center_monthly','table_qr_monthly','waiter_order_monthly'];
for(const first of modes)for(const second of modes){
 if(first===second)continue;
 test(`operating modes ${first} and ${second} cannot be purchased together`,()=>{
  assert.throws(()=>simulateModulePurchase({base:true,requestedModules:[first,second]}),/CONFLICTING_OPERATING_MODES/);
 });
 test(`existing ${first} blocks purchase of ${second}`,()=>{
  assert.throws(()=>simulateModulePurchase({base:true,activeModules:[first],requestedModules:[second]}),/CONFLICTING_OPERATING_MODES/);
 });
}
test('center with mandatory table management can be simulated without activating',()=>{
 const result=simulateModulePurchase({base:true,requestedModules:['center_monthly']});
 assert.equal(result.status,'paid');
 assert.equal(result.quote.amountNetCents,3989);
 assert.deepEqual(result.quote.lines[0].items,['center_monthly','table_management_monthly']);
 assert.equal(result.grantAccess,false);
});
test('failed simulated payment never grants access',()=>{
 const result=simulateModulePurchase({base:true,requestedModules:['table_qr_monthly']},{paymentOutcome:'failed'});
 assert.equal(result.status,'failed');
 assert.equal(result.grantAccess,false);
 assert.equal(result.eligibleForSimulatedActivation,false);
});
test('unpriced waiter mode cannot be purchased even in sandbox',()=>{
 const result=simulateModulePurchase({base:true,requestedModules:['waiter_order_monthly']});
 assert.equal(result.status,'blocked');
 assert.equal(result.reason,'UNPRICED_MODULES');
 assert.equal(result.grantAccess,false);
});

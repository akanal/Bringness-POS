import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateModulePurchase} from './module-sandbox.js';

test('mock payment paid never grants real license',()=>{
 const result=simulateModulePurchase({requestedModules:['pos_base_monthly','center_monthly']});
 assert.equal(result.status,'paid');
 assert.equal(result.quote.amountNetCents,7488);
 assert.equal(result.grantAccess,false);
 assert.equal(result.eligibleForSimulatedActivation,true);
});
test('failed mock payment never activates',()=>{
 const result=simulateModulePurchase({requestedModules:['pos_base_monthly']},{paymentOutcome:'failed'});
 assert.equal(result.grantAccess,false);
 assert.equal(result.eligibleForSimulatedActivation,false);
});
test('unpriced counter ordering cannot be simulated as paid',()=>{
 const result=simulateModulePurchase({requestedModules:['pos_base_monthly','waiter_order_monthly']});
 assert.equal(result.status,'blocked');
 assert.equal(result.grantAccess,false);
});
test('conflicting ordering modes are rejected',()=>{
 assert.throws(()=>simulateModulePurchase({requestedModules:['pos_base_monthly','center_monthly','table_qr_monthly']}),/CONFLICTING_OPERATING_MODES/);
});

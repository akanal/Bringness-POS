import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingPolicy} from './billing-policy.js';
test('No retired restaurant subscription is offered',()=>{
 const p=billingPolicy({base:true});
 assert.equal(Object.hasOwn(p.plans,'restaurant_monthly'),false);
});
test('Base license required for restaurant QR',()=>{
 assert.equal(billingPolicy().plans.table_qr_monthly.eligible,false);
 assert.equal(billingPolicy({base:true}).plans.table_qr_monthly.eligible,true);
});
test('Restaurant QR requires table management',()=>{
 const p=billingPolicy({base:true,tableQr:true});
 assert.equal(p.features.table_qr,true);
 assert.equal(p.features.table_management,true);
 assert.equal(p.plans.table_management_monthly.monthlyNetCents,990);
 assert.deepEqual(p.plans.table_qr_monthly.requires,['pos_base','table_management_monthly']);
});
test('Table management ends with restaurant QR',()=>{
 assert.equal(billingPolicy({base:true,tableQr:false}).features.table_management,false);
});
test('Download license provides base eligibility',()=>{
 const p=billingPolicy({download:true});
 assert.equal(p.features.pos_base,true);
 assert.equal(p.plans.table_qr_monthly.eligible,true);
});

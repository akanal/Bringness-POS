import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planModuleCheckout,mayActivateModule} from './module-checkout.js';
test('QR checkout includes mandatory table management',()=>{
 const p=planModuleCheckout({base:true,requestedModule:'table_qr_monthly'});
 assert.deepEqual(p.items,['table_qr_monthly','table_management_monthly']);
 assert.equal(p.amountNetCents,3989);
 assert.equal(p.grantAccess,false);
});
test('no base license blocks module purchase',()=>{
 assert.throws(()=>planModuleCheckout({requestedModule:'table_qr_monthly'}),/BASE_LICENSE_REQUIRED/);
});
test('duplicate active module blocked',()=>{
 assert.throws(()=>planModuleCheckout({base:true,tableQr:true,requestedModule:'table_qr_monthly'}),/MODULE_ALREADY_ACTIVE/);
});
test('download base grants module purchase eligibility',()=>{
 assert.equal(planModuleCheckout({download:true,requestedModule:'table_qr_monthly'}).items.length,2);
});
test('only verified paid active subscriptions grant access',()=>{
 assert.equal(mayActivateModule({verifiedPayment:true,paymentStatus:'paid',subscriptionActive:true}),true);
 for(const values of [{paymentStatus:'paid',subscriptionActive:true},{verifiedPayment:true,paymentStatus:'open',subscriptionActive:true},{verifiedPayment:true,paymentStatus:'paid',subscriptionActive:false}])
  assert.equal(mayActivateModule(values),false);
});

import {planModuleBasket} from './module-checkout.js';
test('Center includes mandatory table management at 39.89 net',()=>{
 const p=planModuleCheckout({base:true,requestedModule:'center_monthly'});
 assert.deepEqual(p.items,['center_monthly','table_management_monthly']);
 assert.equal(p.amountNetCents,3989);
});
test('Center and restaurant QR cannot be booked together',()=>{
 assert.throws(()=>planModuleBasket({base:true,requestedModules:['center_monthly','table_qr_monthly']}),/CONFLICTING_OPERATING_MODES/);
});
test('Existing Center blocks counter and restaurant QR',()=>{
 for(const module of ['table_qr_monthly','waiter_order_monthly'])
  assert.throws(()=>planModuleBasket({base:true,activeModules:['center_monthly'],requestedModules:[module]}),/CONFLICTING_OPERATING_MODES/);
});
test('Center can be combined with personnel and display',()=>{
 const p=planModuleBasket({base:true,requestedModules:['center_monthly','personnel_monthly','display_control_monthly']});
 assert.equal(p.amountNetCents,6487);
});
test('Restaurant QR and counter are mutually exclusive',()=>{
 assert.throws(()=>planModuleBasket({base:true,requestedModules:['table_qr_monthly','waiter_order_monthly']}),/CONFLICTING_OPERATING_MODES/);
});

test('Duplicate module selection is rejected',()=>{
 assert.throws(()=>planModuleBasket({base:true,requestedModules:['personnel_monthly','personnel_monthly']}),/DUPLICATE_MODULE/);
});
test('Personnel and display are individually priced',()=>{
 const p=planModuleBasket({base:true,requestedModules:['personnel_monthly','display_control_monthly']});
 assert.equal(p.amountNetCents,2498);
 assert.deepEqual(p.unpricedModules,[]);
});
test('Unpriced counter mode is never silently charged as zero',()=>{
 const p=planModuleBasket({base:true,requestedModules:['waiter_order_monthly']});
 assert.equal(p.amountNetCents,null);
 assert.deepEqual(p.unpricedModules,['waiter_order_monthly']);
});

test('Existing legacy QR flag blocks Center purchase',()=>{
 assert.throws(()=>planModuleBasket({base:true,tableQr:true,requestedModules:['center_monthly']}),/CONFLICTING_OPERATING_MODES/);
});
test('Existing legacy QR flag blocks counter purchase',()=>{
 assert.throws(()=>planModuleBasket({base:true,tableQr:true,requestedModules:['waiter_order_monthly']}),/CONFLICTING_OPERATING_MODES/);
});

test('New customer can buy base POS and Center in one basket',()=>{
 const p=planModuleBasket({requestedModules:['pos_base_monthly','center_monthly']});
 assert.equal(p.amountNetCents,7488);
 assert.deepEqual(p.lines[1].items,['center_monthly','table_management_monthly']);
});
test('New customer can buy base POS, QR, personnel and display',()=>{
 const p=planModuleBasket({requestedModules:['pos_base_monthly','table_qr_monthly','personnel_monthly','display_control_monthly']});
 assert.equal(p.amountNetCents,9986);
});
test('Existing base subscription cannot be purchased twice',()=>{
 assert.throws(()=>planModuleBasket({base:true,requestedModules:['pos_base_monthly']}),/BASE_LICENSE_ALREADY_ACTIVE/);
});
test('Without base in cart or active license extra modules are rejected',()=>{
 assert.throws(()=>planModuleBasket({requestedModules:['center_monthly','display_control_monthly']}),/BASE_LICENSE_REQUIRED/);
});

test('Malformed module basket is rejected safely',()=>{
 for(const requestedModules of [null,undefined,{},'center_monthly',[]])
  assert.throws(()=>planModuleBasket({base:true,requestedModules}),/EMPTY_BASKET/);
 assert.throws(()=>planModuleBasket({base:true,requestedModules:[null]}),/INVALID_MODULES/);
});

test('Malformed existing entitlement data cannot bypass validation',()=>{
 assert.throws(()=>planModuleBasket({base:true,activeModules:null,requestedModules:['center_monthly']}),/INVALID_ACTIVE_MODULES/);
 assert.throws(()=>planModuleBasket({base:true,activeModules:[null],requestedModules:['center_monthly']}),/INVALID_ACTIVE_MODULES/);
});
test('Existing base entitlement cannot be bought again even if feature cache is stale',()=>{
 assert.throws(()=>planModuleBasket({activeModules:['pos_base_monthly'],requestedModules:['pos_base_monthly']}),/BASE_LICENSE_ALREADY_ACTIVE/);
});

test('Free base feature may upgrade to paid base subscription with Center',()=>{
 const p=planModuleBasket({baseAccess:true,requestedModules:['pos_base_monthly','center_monthly']});
 assert.equal(p.amountNetCents,7488);
 assert.equal(p.grantAccess,false);
});
test('Download license cannot be charged a second base license',()=>{
 assert.throws(()=>planModuleBasket({download:true,requestedModules:['pos_base_monthly']}),/BASE_LICENSE_ALREADY_ACTIVE/);
});

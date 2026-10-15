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

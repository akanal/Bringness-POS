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

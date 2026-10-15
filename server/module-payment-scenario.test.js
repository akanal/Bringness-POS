import test from 'node:test';
import assert from 'node:assert/strict';
import {planModuleBasket,mayActivateModule} from './module-checkout.js';
import {paymentMatchesCheckout} from './module-payment-verify.js';
import {mollieBillingPaymentMatches,canActivateBillingEntitlement} from './mollie-billing-guard.js';

// Isolated synthetic company: no Railway data, credentials, Mollie API or actual entitlements.
const companyId='sandbox-fixture-company';
const quote=planModuleBasket({requestedModules:['pos_base_monthly','personnel_monthly']});
const grossCents=Math.round(quote.amountNetCents*1.19);
const expected={checkoutId:'sandbox-checkout-1',companyId,paymentId:'tr_synthetic_1',grossCents};
const paid={id:expected.paymentId,status:'paid',amount:{currency:'EUR',value:(grossCents/100).toFixed(2)},metadata:{checkoutId:expected.checkoutId,companyId,planCode:'pos_base_monthly'}};
const transaction={provider_payment_id:expected.paymentId,amount_cents:grossCents,currency:'EUR',company_id:companyId,plan_code:'pos_base_monthly',paid_at:null};

test('Synthetic test-company purchase requires provider-verified paid status before eligibility',()=>{
 assert.equal(quote.grantAccess,false);
 assert.equal(quote.requiresVerifiedPayment,true);
 for(const status of ['open','pending','failed','canceled','expired']){
  const payment={...paid,status};
  assert.equal(paymentMatchesCheckout(payment,expected),false,status);
  assert.equal(canActivateBillingEntitlement(payment,transaction),false,status);
  assert.equal(mayActivateModule({verifiedPayment:false,paymentStatus:status,subscriptionActive:true}),false,status);
 }
 assert.equal(paymentMatchesCheckout(paid,expected),true);
 assert.equal(mollieBillingPaymentMatches(paid,transaction),true);
 assert.equal(canActivateBillingEntitlement(paid,transaction),true);
 assert.equal(mayActivateModule({verifiedPayment:true,paymentStatus:'paid',subscriptionActive:true}),true);
 assert.equal(mayActivateModule({verifiedPayment:true,paymentStatus:'paid',subscriptionActive:false}),false);
});

test('Synthetic test-company rejects swapped company, checkout, amount and replay',()=>{
 assert.equal(paymentMatchesCheckout({...paid,metadata:{...paid.metadata,companyId:'other-company'}},expected),false);
 assert.equal(paymentMatchesCheckout({...paid,metadata:{...paid.metadata,checkoutId:'other-checkout'}},expected),false);
 assert.equal(paymentMatchesCheckout({...paid,amount:{currency:'EUR',value:'0.01'}},expected),false);
 assert.equal(canActivateBillingEntitlement({...paid,metadata:{...paid.metadata,companyId:'other-company'}},transaction),false);
 assert.equal(canActivateBillingEntitlement({...paid,amount:{currency:'EUR',value:'0.01'}},transaction),false);
 assert.equal(canActivateBillingEntitlement(paid,{...transaction,paid_at:new Date()}),false);
});

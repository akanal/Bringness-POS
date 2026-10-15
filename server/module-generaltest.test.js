import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateModulePurchase} from './module-sandbox.js';
import {paymentMatchesCheckout} from './module-payment-verify.js';
import {mollieBillingPaymentMatches} from './mollie-billing-guard.js';
const modules=['center_monthly','table_qr_monthly'];
for(const mode of modules){
 test('generaltest: '+mode+' quote, simulated paid/failed/canceled and Mollie identity',()=>{
  const state={base:true,requestedModules:[mode,'personnel_monthly','display_control_monthly']};
  const success=simulateModulePurchase(state,{paymentOutcome:'paid'});
  assert.equal(success.quote.amountNetCents,6487);
  assert.equal(success.eligibleForSimulatedActivation,true);
  assert.equal(success.grantAccess,false);
  for(const outcome of ['failed','canceled','pending']){
   const result=simulateModulePurchase(state,{paymentOutcome:outcome});
   assert.equal(result.eligibleForSimulatedActivation,false);
   assert.equal(result.grantAccess,false);
  }
  const checkout={paymentId:'tr_generaltest',grossCents:7720,checkoutId:'checkout-generaltest',companyId:'company-generaltest'};
  const payment={id:checkout.paymentId,status:'paid',amount:{currency:'EUR',value:'77.20'},metadata:{checkoutId:checkout.checkoutId,companyId:checkout.companyId}};
  assert.equal(paymentMatchesCheckout(payment,checkout),true);
  assert.equal(paymentMatchesCheckout({...payment,status:'pending'},checkout),false);
  const tx={provider_payment_id:payment.id,amount_cents:checkout.grossCents,currency:'EUR',company_id:checkout.companyId,plan_code:mode};
  assert.equal(mollieBillingPaymentMatches({...payment,metadata:{...payment.metadata,planCode:mode}},tx),true);
  assert.equal(mollieBillingPaymentMatches({...payment,metadata:{...payment.metadata,planCode:'other'}},tx),false);
 });
}
test('generaltest: conflicting operating modes and unpriced waiter mode blocked',()=>{
 assert.throws(()=>simulateModulePurchase({base:true,requestedModules:['center_monthly','table_qr_monthly']}),/CONFLICTING_OPERATING_MODES/);
 const result=simulateModulePurchase({base:true,requestedModules:['waiter_order_monthly']});
 assert.equal(result.status,'blocked');
 assert.equal(result.grantAccess,false);
});

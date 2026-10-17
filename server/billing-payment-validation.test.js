import {test} from 'node:test';import assert from 'node:assert/strict';import {billingPaymentMatches} from './billing-payment-validation.js';
const tx={provider_payment_id:'tr_1',amount_cents:4164,currency:'EUR',mollie_customer_id:'cst_1',mollie_subscription_id:'sub_1'},p={id:'tr_1',status:'paid',amount:{currency:'EUR',value:'41.64'},customerId:'cst_1',subscriptionId:'sub_1'};
test('billing only releases the exact provider payment, amount, currency and contract',()=>{
 assert(billingPaymentMatches(tx,p));for(const change of [{id:'tr_2'},{customerId:'cst_2'},{subscriptionId:'sub_2'},{status:'unknown'},{amount:{currency:'USD',value:'41.64'}},{amount:{currency:'EUR',value:'41.6401'}},{amountRefunded:{currency:'EUR',value:'0.01'}},{amountChargedBack:{currency:'EUR',value:'41.64'}}])assert.equal(billingPaymentMatches(tx,{...p,...change}),false);
});

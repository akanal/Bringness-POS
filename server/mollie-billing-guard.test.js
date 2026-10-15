import test from 'node:test';
import assert from 'node:assert/strict';
import {mollieBillingPaymentMatches,canActivateBillingEntitlement} from './mollie-billing-guard.js';
const tx={provider_payment_id:'tr_123',amount_cents:8911,currency:'EUR',company_id:'company-1',plan_code:'pos_base_monthly'};
const paid={id:'tr_123',status:'paid',amount:{currency:'EUR',value:'89.11'},metadata:{companyId:'company-1',planCode:'pos_base_monthly'}};
test('Mollie webhook payment must match the stored transaction',()=>{
 assert.equal(mollieBillingPaymentMatches(paid,tx),true);
});
test('Mollie webhook rejects altered amount, currency, identity, and plan',()=>{
 for(const change of [
  {...paid,id:'tr_wrong'},
  {...paid,amount:{currency:'EUR',value:'89.10'}},
  {...paid,amount:{currency:'USD',value:'89.11'}},
  {...paid,amount:{currency:'EUR',value:'89.110'}},
  {...paid,metadata:{...paid.metadata,companyId:'company-2'}},
  {...paid,metadata:{...paid.metadata,planCode:'center_monthly'}},
  {...paid,metadata:null},
  null
 ])assert.equal(mollieBillingPaymentMatches(change,tx),false);
});

test('Mollie webhook rejects all non-paid statuses',()=>{
 for(const status of ['open','pending','failed','canceled','expired','authorized']){
  assert.equal(mollieBillingPaymentMatches({...paid,status},tx),false,status);
 }
});

test('Nonpaid callback may be identity-verified without implying payment',()=>{
 for(const status of ['pending','failed','canceled','expired']){
  assert.equal(mollieBillingPaymentMatches({...paid,status},tx,{requirePaid:false}),true,status);
  assert.equal(mollieBillingPaymentMatches({...paid,status},tx),false,status);
 }
 assert.equal(mollieBillingPaymentMatches({...paid,status:'failed',amount:{currency:'EUR',value:'0.01'}},tx,{requirePaid:false}),false);
});

test('Unknown provider status cannot pass webhook validation',()=>{
 for(const status of ['unknown','refunded','chargeback','']){
  assert.equal(mollieBillingPaymentMatches({...paid,status},tx,{requirePaid:false}),false,status);
 }
});

test('Entitlement activation requires newly paid transaction',()=>{
 assert.equal(canActivateBillingEntitlement(paid,tx),true);
 assert.equal(canActivateBillingEntitlement({...paid,status:'pending'},tx),false);
 assert.equal(canActivateBillingEntitlement(paid,{...tx,paid_at:new Date()}),false);
});

test('Mollie payment cannot activate from zero, negative or malformed stored amounts',()=>{
 for(const amount of [0,-1,'8911','89.11',null,undefined,NaN,Infinity]){
  assert.equal(mollieBillingPaymentMatches(paid,{...tx,amount_cents:amount}),false,String(amount));
 }
 assert.equal(mollieBillingPaymentMatches({...paid,amount:{currency:'EUR',value:'0.00'}},{...tx,amount_cents:0}),false);
 assert.equal(mollieBillingPaymentMatches(paid,{...tx,company_id:''}),false);
 assert.equal(mollieBillingPaymentMatches(paid,{...tx,provider_payment_id:''}),false);
});

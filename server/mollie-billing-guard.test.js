import test from 'node:test';
import assert from 'node:assert/strict';
import {mollieBillingPaymentMatches} from './mollie-billing-guard.js';
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

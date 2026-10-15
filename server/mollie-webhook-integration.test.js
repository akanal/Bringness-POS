import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {mollieBillingPaymentMatches,canActivateBillingEntitlement} from './mollie-billing-guard.js';

const source=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'index.js'),'utf8');
const tx={provider_payment_id:'tr_test',company_id:'tenant-a',plan_code:'pos_base_monthly',currency:'EUR',amount_cents:3499,paid_at:null};
const paid={id:'tr_test',status:'paid',amount:{currency:'EUR',value:'34.99'},metadata:{companyId:'tenant-a',planCode:'pos_base_monthly'}};

test('live webhook verifies payment identity before any transaction update',()=>{
 const route=source.slice(source.indexOf('if(p==="/api/v1/mollie/webhook"'),source.indexOf('if(p==="/api/v1/billing/profile"'));
 assert.ok(route.includes('mollieBillingPaymentMatches(m,tx,{requirePaid:false})'));
 assert.ok(route.indexOf('mollieBillingPaymentMatches(m,tx,{requirePaid:false})')<route.indexOf('UPDATE billing_transactions SET status'));
 assert.ok(route.includes('if(canActivateBillingEntitlement(m,tx)){'));
 assert.ok(route.indexOf('if(canActivateBillingEntitlement(m,tx)){')<route.indexOf('INSERT INTO company_entitlements'));
});

test('webhook payment lifecycle does not activate before paid or twice',()=>{
 for(const status of ['open','pending','authorized','failed','expired','canceled']){
  const event={...paid,status};
  assert.equal(mollieBillingPaymentMatches(event,tx,{requirePaid:false}),true,status);
  assert.equal(canActivateBillingEntitlement(event,tx),false,status);
 }
 assert.equal(canActivateBillingEntitlement(paid,tx),true);
 assert.equal(canActivateBillingEntitlement(paid,{...tx,paid_at:'2026-10-15T00:00:00Z'}),false);
 assert.equal(canActivateBillingEntitlement({...paid,metadata:{...paid.metadata,companyId:'tenant-b'}},tx),false);
});

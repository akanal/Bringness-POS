import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileAndIssueShopInvoice} from './shop-payment-invoice-flow.js';

test('requires server dependencies before touching payment state',async()=>{
 await assert.rejects(reconcileAndIssueShopInvoice({year:2026}),/SHOP_INVOICE_DEPENDENCIES_REQUIRED/);
});
test('rejects invalid fiscal year before provider access',async()=>{
 let called=false;
 await assert.rejects(reconcileAndIssueShopInvoice({
  pool:{},year:1999,
  fetchProviderPayment:async()=>{called=true;},
  loadInvoiceContent:async()=>({})
 }),/SHOP_INVOICE_YEAR_INVALID/);
 assert.equal(called,false);
});
test('does not call invoice loader when ledger order is absent',async()=>{
 let loaded=false;
 const pool={query:async()=>({rows:[]})};
 await assert.rejects(reconcileAndIssueShopInvoice({
  pool,year:2026,orderId:'missing',companyId:'company',
  fetchProviderPayment:async()=>{throw Error('SHOULD_NOT_FETCH');},
  loadInvoiceContent:async()=>{loaded=true;return {};}
 }),/PAYMENT_ORDER_NOT_FOUND/);
 assert.equal(loaded,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopPaymentLedger,initializeShopPaymentLedger,bindShopPaymentProvider} from './shop-payment-ledger-pg.js';
import {reconcileAndIssueShopInvoice} from './shop-payment-invoice-flow.js';
const orderId='33333333-3333-4333-8333-333333333333';
const companyId='11111111-1111-4111-8111-111111111111';
test('paid provider state reaches invoice validation; invalid invoice rolls back without issuing document',async()=>{
 const db=new PGlite();
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await initializeShopPaymentLedger(pool,{orderId,companyId,amountCents:500,currency:'EUR'});
  await bindShopPaymentProvider(pool,{orderId,companyId,providerReference:'tr_500'});
  let loaded=0;
  await assert.rejects(reconcileAndIssueShopInvoice({
   pool,orderId,companyId,year:2026,
   fetchProviderPayment:async id=>({id,orderId,amountCents:500,currency:'EUR',status:'paid'}),
   loadInvoiceContent:async()=>{loaded++;return {totalCents:500};}
  }),/SHOP_INVOICE_FIELD_INVALID/);
  assert.equal(loaded,1);
  const payment=await db.query('SELECT snapshot FROM shop_payment_ledger WHERE order_id=$1',[orderId]);
  assert.equal(payment.rows[0].snapshot.status,'paid');
 }finally{await db.close();}
});

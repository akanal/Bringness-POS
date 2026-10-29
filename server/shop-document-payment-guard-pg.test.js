import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentNumbers} from './shop-document-number-pg.js';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopPaymentLedger} from './shop-payment-ledger-pg.js';
import {issueShopDocumentRecord} from './shop-document-issue-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333';
test('confirmed payment required and duplicate invoices blocked in guarded mode',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 const args={companyId,orderId,kind:'invoice',year:2026,content:{totalCents:1190},requirePaid:true};
 try{
  await migrateShopDocumentNumbers(db);await migrateShopDocumentRecords(db);await migrateShopPaymentLedger(db);
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED/);
  await db.query("INSERT INTO shop_payment_ledger(order_id,company_id,amount_cents,currency,snapshot,provider_reference) VALUES($1,$2,1190,'EUR',$3,'tr_confirmed')",[orderId,companyId,{amountCents:1190,events:[],status:'unpaid'}]);
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED/);
  await db.query("UPDATE shop_payment_ledger SET snapshot=$2 WHERE order_id=$1",[orderId,{amountCents:1190,status:'paid',events:[{kind:'paid',id:'tr_confirmed',amountCents:1190}]}]);
  const first=await issueShopDocumentRecord(pool,args);
  assert.equal(first.documentNumber,'INV-2026-000000001');
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_INVOICE_ALREADY_EXISTS/);
  const count=await db.query('SELECT count(*)::int AS n FROM shop_document_records');
  assert.equal(count.rows[0].n,1);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentNumbers} from './shop-document-number-pg.js';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive} from './shop-document-archive-pg.js';
import {migrateShopPaymentLedger} from './shop-payment-ledger-pg.js';
import {issueShopDocumentRecord} from './shop-document-issue-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333';
test('confirmed payment required and duplicate invoices blocked in guarded mode',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 const args={companyId,orderId,kind:'invoice',year:2026,content:{totalCents:1190},requirePaid:true,archive:true};
 try{
  await migrateShopDocumentNumbers(db);await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);await migrateShopPaymentLedger(db);
  await assert.rejects(issueShopDocumentRecord(pool,{...args,archive:false}),/SHOP_DOCUMENT_ARCHIVE_REQUIRED/);
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED/);
  await db.query("INSERT INTO shop_payment_ledger(order_id,company_id,amount_cents,currency,snapshot,provider_reference) VALUES($1,$2,1190,'EUR',$3,'tr_confirmed')",[orderId,companyId,{amountCents:1190,events:[],status:'unpaid'}]);
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED/);
  await db.query("UPDATE shop_payment_ledger SET snapshot=$2 WHERE order_id=$1",[orderId,{amountCents:1190,status:'paid',events:[{kind:'paid',id:'tr_confirmed',amountCents:1190}]}]);
  await assert.rejects(issueShopDocumentRecord(pool,{...args,content:{totalCents:1191}}),/SHOP_DOCUMENT_PAYMENT_AMOUNT_MISMATCH/);
  await assert.rejects(issueShopDocumentRecord(pool,{...args,content:{totalCents:'1190'}}),/SHOP_DOCUMENT_PAYMENT_AMOUNT_MISMATCH/);
  const first=await issueShopDocumentRecord(pool,args);
  assert.equal(first.documentNumber,'INV-2026-000000001');
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_INVOICE_ALREADY_EXISTS/);
  const count=await db.query('SELECT count(*)::int AS n FROM shop_document_records');
  assert.equal(count.rows[0].n,1);
 }finally{await db.close();}
});

test('guarded credit note requires a recorded refund and prevents repeated crediting',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopDocumentNumbers(db);await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);await migrateShopPaymentLedger(db);
  await db.query("INSERT INTO shop_payment_ledger(order_id,company_id,amount_cents,currency,snapshot,provider_reference) VALUES($1,$2,1190,'EUR',$3,'tr_confirmed')",[orderId,companyId,{amountCents:1190,status:'paid',events:[{kind:'paid',id:'tr_confirmed',amountCents:1190}]}]);
  const invoice=await issueShopDocumentRecord(pool,{companyId,orderId,kind:'invoice',year:2026,content:{totalCents:1190},requirePaid:true,archive:true});
  const content={originalInvoiceId:invoice.id,refundId:'re_123',amountCents:300,currency:'EUR'};
  const args={companyId,orderId,kind:'credit_note',year:2026,originalDocumentId:invoice.id,content,requirePaid:true,archive:true};
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED/);
  await db.query("UPDATE shop_payment_ledger SET snapshot=$2 WHERE order_id=$1",[orderId,{amountCents:1190,status:'partially_refunded',events:[{kind:'paid',id:'tr_confirmed',amountCents:1190},{kind:'refund',id:'re_123',amountCents:300}]}]);
  await assert.rejects(issueShopDocumentRecord(pool,{...args,content:{...content,amountCents:301}}),/SHOP_DOCUMENT_REFUND_NOT_CONFIRMED/);
  const credit=await issueShopDocumentRecord(pool,args);
  assert.equal(credit.documentNumber,'CRN-2026-000000001');
  await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_REFUND_ALREADY_CREDITED/);
 }finally{await db.close();}
});

test('rejects inconsistent refund totals and duplicate payment events',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopDocumentNumbers(db);await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);await migrateShopPaymentLedger(db);
  const paid={kind:'paid',id:'tr_confirmed',amountCents:1190};
  await db.query("INSERT INTO shop_payment_ledger(order_id,company_id,amount_cents,currency,snapshot,provider_reference) VALUES($1,$2,1190,'EUR',$3,'tr_confirmed')",[orderId,companyId,{amountCents:1190,status:'paid',events:[paid]}]);
  const args={companyId,orderId,kind:'invoice',year:2026,content:{totalCents:1190},requirePaid:true,archive:true};
  for(const events of [[paid,paid],[paid,{kind:'refund',id:'re_1',amountCents:1200}]]) {
   await db.query('UPDATE shop_payment_ledger SET snapshot=$2 WHERE order_id=$1',[orderId,{amountCents:1190,status:'paid',events}]);
   await assert.rejects(issueShopDocumentRecord(pool,args),/SHOP_DOCUMENT_PAYMENT_LEDGER_INVALID/);
  }
  const records=await db.query('SELECT count(*)::int AS n FROM shop_document_records');
  assert.equal(records.rows[0].n,0);
 }finally{await db.close();}
});

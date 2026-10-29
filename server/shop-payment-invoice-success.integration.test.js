import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopPaymentLedger,initializeShopPaymentLedger,bindShopPaymentProvider} from './shop-payment-ledger-pg.js';
import {migrateShopDocumentNumbers} from './shop-document-number-pg.js';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive} from './shop-document-archive-pg.js';
import {verifyShopDocumentArchiveConsistency} from './shop-document-archive-integrity-pg.js';
import {reconcileAndIssueShopInvoice} from './shop-payment-invoice-flow.js';

const companyId='11111111-1111-4111-8111-111111111111';
const orderId='33333333-3333-4333-8333-333333333333';
const invoice={
 sellerName:'Seller',sellerAddress:'Street 1',buyerName:'Buyer',buyerAddress:'Street 2',
 description:'Order',serviceDate:'2026-10-29',issueDate:'2026-10-29',
 sellerTaxId:'DE123456789',taxLines:[{netCents:1000,taxCents:190,taxRate:19}],totalCents:1190
};

test('verified payment issues one archived invoice, duplicate attempt does not consume a number',async()=>{
 const db=new PGlite();
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await migrateShopDocumentNumbers(pool);
  await migrateShopDocumentRecords(pool);
  await migrateShopDocumentArchive(pool);
  await initializeShopPaymentLedger(pool,{orderId,companyId,amountCents:1190,currency:'EUR'});
  await bindShopPaymentProvider(pool,{orderId,companyId,providerReference:'tr_1190'});
  const options={pool,orderId,companyId,year:2026,
   fetchProviderPayment:async id=>({id,orderId,amountCents:1190,currency:'EUR',status:'paid'}),
   loadInvoiceContent:async()=>structuredClone(invoice)};
  const issued=await reconcileAndIssueShopInvoice(options);
  assert.match(issued.documentNumber,/^INV-2026-\d{9}$/);
  assert.equal(await verifyShopDocumentArchiveConsistency(db,issued.id),true);
  await assert.rejects(reconcileAndIssueShopInvoice(options),/SHOP_DOCUMENT_INVOICE_ALREADY_EXISTS/);
  const documents=await db.query('SELECT count(*)::int AS count FROM shop_document_records');
  const archive=await db.query('SELECT count(*)::int AS count FROM shop_document_archive');
  const counter=await db.query("SELECT last_sequence FROM shop_document_counters WHERE kind='invoice'");
  assert.equal(documents.rows[0].count,1);
  assert.equal(archive.rows[0].count,1);
  assert.equal(Number(counter.rows[0].last_sequence),1);
 }finally{await db.close();}
});

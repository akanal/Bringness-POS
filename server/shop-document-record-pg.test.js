import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentRecords,storeShopDocumentRecord} from './shop-document-record-pg.js';
const companyId='11111111-1111-4111-8111-111111111111';
const orderId='33333333-3333-4333-8333-333333333333';
const invoiceId='44444444-4444-4444-8444-444444444444';
const creditId='55555555-5555-4555-8555-555555555555';
const invoice={id:invoiceId,companyId,orderId,kind:'invoice',year:2026,sequence:1,documentNumber:'INV-2026-000000001',content:{totalCents:1000}};
test('stores immutable invoice and linked credit note; rejects reused numbers',async()=>{
 const db=new PGlite();
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopDocumentRecords(pool);
  await storeShopDocumentRecord(pool,invoice);
  const credit={id:creditId,companyId,orderId,kind:'credit_note',year:2026,sequence:1,documentNumber:'CRN-2026-000000001',originalDocumentId:invoiceId,content:{amountCents:300}};
  await storeShopDocumentRecord(pool,credit);
  await assert.rejects(storeShopDocumentRecord(pool,{...invoice,id:'66666666-6666-4666-8666-666666666666'}));
  await assert.rejects(storeShopDocumentRecord(pool,{...credit,id:'77777777-7777-4777-8777-777777777777',sequence:2,documentNumber:'CRN-2026-000000002',originalDocumentId:creditId}),/ORIGINAL_NOT_FOUND/);
  await assert.rejects(db.query('UPDATE shop_document_records SET content=$1 WHERE id=$2',[{totalCents:999},invoiceId]),/SHOP_DOCUMENT_RECORD_IMMUTABLE/);
  await assert.rejects(db.query('DELETE FROM shop_document_records WHERE id=$1',[invoiceId]),/SHOP_DOCUMENT_RECORD_IMMUTABLE/);
  const rows=await db.query('SELECT kind,document_number FROM shop_document_records ORDER BY kind');
  assert.equal(rows.rows.length,2);
 }finally{await db.close();}
});
test('credit note cannot reference missing invoice',async()=>{
 const db=new PGlite();
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopDocumentRecords(pool);
  await assert.rejects(storeShopDocumentRecord(pool,{id:creditId,companyId,orderId,kind:'credit_note',year:2026,sequence:1,documentNumber:'CRN-2026-000000001',originalDocumentId:invoiceId,content:{amountCents:300}}),/ORIGINAL_NOT_FOUND/);
 }finally{await db.close();}
});

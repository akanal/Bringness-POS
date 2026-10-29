import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentNumbers} from './shop-document-number-pg.js';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {issueShopDocumentRecord} from './shop-document-issue-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333';
test('number allocation and document insert commit atomically',async()=>{
 const db=new PGlite();
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopDocumentNumbers(pool);await migrateShopDocumentRecords(pool);
  const args={companyId,kind:'invoice',year:2026,orderId,content:{totalCents:500}};
  const first=await issueShopDocumentRecord(pool,args);
  assert.equal(first.documentNumber,'INV-2026-000000001');
  await assert.rejects(issueShopDocumentRecord(pool,{...args,id:first.id}));
  const second=await issueShopDocumentRecord(pool,args);
  assert.equal(second.documentNumber,'INV-2026-000000002');
  const credit=await issueShopDocumentRecord(pool,{companyId,kind:'credit_note',year:2026,orderId,originalDocumentId:first.id,content:{amountCents:100}});
  assert.equal(credit.documentNumber,'CRN-2026-000000001');
  const count=await db.query('SELECT count(*)::int AS count FROM shop_document_records');
  assert.equal(count.rows[0].count,3);
 }finally{await db.close();}
});

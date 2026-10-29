import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentNumbers} from './shop-document-number-pg.js';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive} from './shop-document-archive-pg.js';
import {issueShopDocumentRecord} from './shop-document-issue-pg.js';
import {verifyShopDocumentArchiveConsistency} from './shop-document-archive-integrity-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333';
test('issue and archive commit together, and rollback if archive insert fails',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopDocumentNumbers(db);await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);
  await assert.rejects(issueShopDocumentRecord(pool,{companyId,kind:'invoice',year:2026,orderId,content:{totalCents:1190},archive:'yes'}),/SHOP_DOCUMENT_ARCHIVE_OPTION_INVALID/);
  const first=await issueShopDocumentRecord(pool,{companyId,kind:'invoice',year:2026,orderId,content:{totalCents:1190},archive:true});
  assert.equal(await verifyShopDocumentArchiveConsistency(db,first.id),true);
  const duplicateId='55555555-5555-4555-8555-555555555555';
  await db.query('DROP TABLE shop_document_archive_audit').catch(()=>{});
  await db.query('DROP TABLE shop_document_archive');
  await assert.rejects(issueShopDocumentRecord(pool,{companyId,kind:'invoice',year:2026,orderId,content:{totalCents:1290},id:duplicateId,archive:true}));
  const records=await db.query('SELECT count(*)::int AS count FROM shop_document_records');
  assert.equal(records.rows[0].count,1);
  const counter=await db.query('SELECT last_sequence FROM shop_document_counters');
  assert.equal(Number(counter.rows[0].last_sequence),1);
 }finally{await db.close();}
});

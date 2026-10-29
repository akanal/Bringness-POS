import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive,archiveShopDocument} from './shop-document-archive-pg.js';
import {migrateShopDocumentArchiveAudit,recordShopDocumentArchiveAccess} from './shop-document-archive-audit-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333',documentId='44444444-4444-4444-8444-444444444444';
test('audits existing archived document access and blocks log mutation',async()=>{
 const db=new PGlite();
 try{
  await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);await migrateShopDocumentArchiveAudit(db);
  await db.query("INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,content) VALUES($1,$2,'invoice',2026,1,'INV-2026-000000001',$3,$4)",[documentId,companyId,orderId,{totalCents:1190}]);
  await assert.rejects(recordShopDocumentArchiveAccess(db,{documentId,actorId:'staff-1',action:'read'}),/DOCUMENT_NOT_FOUND/);
  await archiveShopDocument(db,{documentId,payload:{totalCents:1190}});
  const logged=await recordShopDocumentArchiveAccess(db,{documentId,actorId:'staff-1',action:'verify'});
  assert.equal(logged.action,'verify');
  await assert.rejects(db.query('DELETE FROM shop_document_archive_audit'),/SHOP_ARCHIVE_AUDIT_IMMUTABLE/);
  await assert.rejects(db.query("UPDATE shop_document_archive_audit SET actor_id='other'"),/SHOP_ARCHIVE_AUDIT_IMMUTABLE/);
  await assert.rejects(recordShopDocumentArchiveAccess(db,{documentId,actorId:'',action:'read'}),/SHOP_ARCHIVE_AUDIT_INVALID/);
 }finally{await db.close();}
});

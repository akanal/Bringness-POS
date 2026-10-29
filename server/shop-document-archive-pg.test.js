import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive,archiveShopDocument,verifyArchivedShopDocument} from './shop-document-archive-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333',documentId='44444444-4444-4444-8444-444444444444';
test('archive stores one digest and detects altered payload',async()=>{
 const db=new PGlite();
 try{
  await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);
  await db.query("INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,content) VALUES($1,$2,'invoice',2026,1,'INV-2026-000000001',$3,$4)",[documentId,companyId,orderId,{totalCents:1190}]);
  await archiveShopDocument(db,{documentId,payload:{invoice:'INV-2026-000000001',totalCents:1190}});
  assert.equal(await verifyArchivedShopDocument(db,documentId),true);
  await assert.rejects(archiveShopDocument(db,{documentId,payload:{totalCents:1190}}),/ALREADY_EXISTS/);
  await db.query('UPDATE shop_document_archive SET payload=$1 WHERE document_id=$2',[{invoice:'INV-2026-000000001',totalCents:1191},documentId]);
  assert.equal(await verifyArchivedShopDocument(db,documentId),false);
 }finally{await db.close();}
});

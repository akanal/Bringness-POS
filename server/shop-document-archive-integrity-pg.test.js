import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive,archiveShopDocument} from './shop-document-archive-pg.js';
import {verifyShopDocumentArchiveConsistency} from './shop-document-archive-integrity-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333',documentId='44444444-4444-4444-8444-444444444444';
test('archive must match issued document content, not only its own digest',async()=>{
 const db=new PGlite();
 try{
  await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);
  await db.query("INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,content) VALUES($1,$2,'invoice',2026,1,'INV-2026-000000001',$3,$4)",[documentId,companyId,orderId,{totalCents:1190}]);
  await archiveShopDocument(db,{documentId,payload:{documentNumber:'INV-2026-000000001',kind:'invoice',orderId,content:{totalCents:1190}}});
  assert.equal(await verifyShopDocumentArchiveConsistency(db,documentId),true);
  await db.query("INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,content) VALUES($1,$2,'invoice',2026,2,'INV-2026-000000002',$3,$4)",['55555555-5555-4555-8555-555555555555',companyId,orderId,{totalCents:1190}]);
  await archiveShopDocument(db,{documentId:'55555555-5555-4555-8555-555555555555',payload:{documentNumber:'INV-2026-000000002',kind:'invoice',orderId,content:{totalCents:1191}}});
  await assert.rejects(verifyShopDocumentArchiveConsistency(db,'55555555-5555-4555-8555-555555555555'),/RECORD_MISMATCH/);
 }finally{await db.close();}
});

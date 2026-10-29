import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive} from './shop-document-archive-pg.js';
import {archiveIssuedShopDocument} from './shop-document-archive-write-pg.js';
import {verifyShopDocumentArchiveConsistency} from './shop-document-archive-integrity-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333',documentId='44444444-4444-4444-8444-444444444444';
test('archive derives content from issued document and prevents replay',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);
  await assert.rejects(archiveIssuedShopDocument(pool,documentId),/DOCUMENT_NOT_FOUND/);
  await db.query("INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,content) VALUES($1,$2,'invoice',2026,1,'INV-2026-000000001',$3,$4)",[documentId,companyId,orderId,{totalCents:1190}]);
  const archived=await archiveIssuedShopDocument(pool,documentId);
  assert.equal(archived.documentId,documentId);
  assert.equal(await verifyShopDocumentArchiveConsistency(db,documentId),true);
  await assert.rejects(archiveIssuedShopDocument(pool,documentId),/ALREADY_EXISTS/);
 }finally{await db.close();}
});

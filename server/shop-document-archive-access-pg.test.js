import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentRecords} from './shop-document-record-pg.js';
import {migrateShopDocumentArchive,archiveShopDocument} from './shop-document-archive-pg.js';
import {migrateShopDocumentArchiveAudit} from './shop-document-archive-audit-pg.js';
import {readShopArchivedDocument} from './shop-document-archive-access-pg.js';
const companyId='11111111-1111-4111-8111-111111111111',orderId='33333333-3333-4333-8333-333333333333',documentId='44444444-4444-4444-8444-444444444444';
test('read verifies integrity and commits an audit entry',async()=>{
 const db=new PGlite(),pool={connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopDocumentRecords(db);await migrateShopDocumentArchive(db);await migrateShopDocumentArchiveAudit(db);
  await db.query("INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,content) VALUES($1,$2,'invoice',2026,1,'INV-2026-000000001',$3,$4)",[documentId,companyId,orderId,{totalCents:1190}]);
  await archiveShopDocument(db,{documentId,payload:{totalCents:1190}});
  const read=await readShopArchivedDocument(pool,{documentId,actor:{id:'staff-1',companyId,role:'staff'}});
  assert.equal(read.payload.totalCents,1190);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM shop_document_archive_audit')).rows[0].count,1);
  await assert.rejects(readShopArchivedDocument(pool,{documentId,actor:{id:'',companyId,role:'staff'}}),/ACCESS_INVALID/);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM shop_document_archive_audit')).rows[0].count,1);
  await assert.rejects(readShopArchivedDocument(pool,{documentId,actor:{id:'staff-2',companyId:'22222222-2222-4222-8222-222222222222',role:'admin'}}),/COMPANY_FORBIDDEN/);
  await assert.rejects(readShopArchivedDocument(pool,{documentId,actor:{id:'staff-1',companyId,role:'staff'},action:'export'}),/ACCESS_FORBIDDEN/);
 }finally{await db.close();}
});

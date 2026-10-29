import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopDocumentNumbers,allocateShopDocumentNumber} from './shop-document-number-pg.js';
const companyId='11111111-1111-4111-8111-111111111111';
test('allocates independent sequences for each year and document type',async()=>{
 const db=new PGlite();
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopDocumentNumbers(pool);
  assert.equal((await allocateShopDocumentNumber(pool,{companyId,kind:'invoice',year:2026})).documentNumber,'INV-2026-000000001');
  assert.equal((await allocateShopDocumentNumber(pool,{companyId,kind:'invoice',year:2026})).documentNumber,'INV-2026-000000002');
  assert.equal((await allocateShopDocumentNumber(pool,{companyId,kind:'credit_note',year:2026})).documentNumber,'CRN-2026-000000001');
  assert.equal((await allocateShopDocumentNumber(pool,{companyId,kind:'invoice',year:2027})).documentNumber,'INV-2027-000000001');
 }finally{await db.close();}
});
test('exhausted sequence fails without wrapping or reusing numbers',async()=>{
 const db=new PGlite();
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopDocumentNumbers(pool);
  await db.query('INSERT INTO shop_document_counters(company_id,kind,year,last_sequence) VALUES($1,$2,$3,$4)',[companyId,'invoice',2026,999999999]);
  await assert.rejects(allocateShopDocumentNumber(pool,{companyId,kind:'invoice',year:2026}),/SEQUENCE_EXHAUSTED/);
 }finally{await db.close();}
});

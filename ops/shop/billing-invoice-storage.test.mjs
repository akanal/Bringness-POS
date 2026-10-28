import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {dependency} from './dependency.mjs';
import {migrateBillingInvoiceStorage,storedBillingInvoice} from '../../server/billing-invoice-storage.js';
import {invoicePdf} from '../../server/billing-mail.js';
const company='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
async function setup(){
 const {PGlite}=await import(pathToFileURL(dependency('@electric-sql/pglite','SHOP_PGLITE_PATH'))),db=new PGlite();await db.waitReady;
 await db.exec('CREATE TABLE billing_transactions(id uuid PRIMARY KEY,company_id uuid,status text,invoice_number text)');await db.query("INSERT INTO billing_transactions VALUES($1,$2,'paid','BN-TEST-1')",[id,company]);
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 await migrateBillingInvoiceStorage(pool);await migrateBillingInvoiceStorage(pool);
 const blobs=new Map();let puts=0,gets=0;
 const store={async putExact(record,bytes){puts++;blobs.set(record.sha,Buffer.from(bytes));},async getExact(record){gets++;return Buffer.from(blobs.get(record.sha));}};
 const z={id,company_id:company,status:'paid',paid_at:'2026-10-28',invoice_date:'2026-10-28',invoice_number:'BN-TEST-1',name:'Kasse',net_cents:3499,vat_cents:665,vat_rate:19,amount_cents:4164,currency:'EUR',billing_snapshot:{company_name:'Fixture'}};
 return {db,pool,store,z,blobs,counts:()=>({puts,gets})};
}
test('automatic invoice stores PDF once, reuses exact bytes and rejects changed source or corrupt readback',async()=>{
 const f=await setup();try{
  let renders=0;const render=async()=>{renders++;return Buffer.from('%PDF-1.7\nsynthetic invoice\n%%EOF');};
  const first=await storedBillingInvoice(f.pool,f.store,f.z,{},render);
  assert.deepEqual(await storedBillingInvoice(f.pool,f.store,f.z,{},render),first);
  assert.equal(renders,1);assert.deepEqual(f.counts(),{puts:1,gets:1});
  const row=(await f.db.query('SELECT * FROM billing_invoice_files')).rows[0];assert.equal(row.company_id,company);assert.ok(!Object.hasOwn(row,'pdf'));
  await assert.rejects(storedBillingInvoice(f.pool,f.store,{...f.z,amount_cents:9999},{},render),{code:'INVOICE_STORAGE_UNAVAILABLE'});
  await assert.rejects(storedBillingInvoice(f.pool,f.store,{...f.z,company_id:id},{},render),{code:'INVOICE_STORAGE_UNAVAILABLE'});
  f.blobs.set(row.pdf_sha256,Buffer.from('corrupt'));
  await assert.rejects(storedBillingInvoice(f.pool,f.store,f.z,{},render),{code:'INVOICE_STORAGE_UNAVAILABLE'});
  await assert.rejects(f.db.query('DELETE FROM billing_invoice_files'),/INVOICE_FILE_IMMUTABLE/);
 }finally{await f.db.close();}
});
test('provider failure leaves no completed record and permits retry without payment or invoice writes',async()=>{
 const f=await setup();try{
  const render=async()=>Buffer.from('%PDF-1.7\nsynthetic invoice\n%%EOF');
  await assert.rejects(storedBillingInvoice(f.pool,{putExact:async()=>{throw Error('provider unavailable');}},f.z,{},render),/provider unavailable/);
  assert.equal((await f.db.query('SELECT * FROM billing_invoice_files')).rows.length,0);
  await storedBillingInvoice(f.pool,f.store,f.z,{},render);
  assert.equal((await f.db.query('SELECT * FROM billing_invoice_files')).rows.length,1);
  assert.equal((await f.db.query('SELECT * FROM billing_transactions')).rows.length,1);
  await assert.rejects(storedBillingInvoice(f.pool,null,f.z,{},render),{code:'INVOICE_STORAGE_UNAVAILABLE'});
  await assert.rejects(storedBillingInvoice(f.pool,f.store,{...f.z,status:'failed'},{},render),{code:'INVOICE_STORAGE_UNAVAILABLE'});
 }finally{await f.db.close();}
});
test('actual billing PDF renderer produces stable bytes for the same invoice',async()=>{
 const z={invoice_date:'2026-10-28',invoice_number:'BN-TEST',net_cents:3499,vat_cents:665,vat_rate:19,amount_cents:4164};
 assert.deepEqual(await invoicePdf(z,{}),await invoicePdf(z,{}));
});

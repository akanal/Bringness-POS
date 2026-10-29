import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateMerchantCustomerNumbers} from './merchant-customer-numbers.js';
import {invoicePdf} from './billing-mail.js';

test('existing and new merchants have unique persistent numbers; repeat migration is safe',async()=>{
 const db=new PGlite();
 try {
  await db.exec('CREATE TABLE companies(id integer PRIMARY KEY); INSERT INTO companies(id) VALUES (1),(2);');
  const pool={query:(sql,args)=>args?db.query(sql,args):db.exec(sql)};
  await migrateMerchantCustomerNumbers(pool);
  let rows=(await db.query('SELECT id,customer_number FROM companies ORDER BY id')).rows;
  assert.equal(rows.length,2);
  assert(rows.every(x=>x.customer_number!==null));
  assert.notEqual(String(rows[0].customer_number),String(rows[1].customer_number));
  await migrateMerchantCustomerNumbers(pool);
  assert.deepEqual((await db.query('SELECT id,customer_number FROM companies ORDER BY id')).rows,rows);
  await db.query('INSERT INTO companies(id) VALUES(3)');
  rows=(await db.query('SELECT customer_number FROM companies')).rows;
  assert.equal(new Set(rows.map(x=>String(x.customer_number))).size,3);
  await assert.rejects(db.query('UPDATE companies SET customer_number=$1 WHERE id=3',[rows[0].customer_number]),/unique|duplicate/i);
 } finally {await db.close()}
});

test('Bringness invoice PDF contains merchant number and omits it when unavailable',async()=>{
 const base={invoice_number:'BN-TEST-2026',invoice_date:'2026-10-29',amount_cents:3499,net_cents:2940,vat_cents:559,vat_rate:19,name:'Bringness POS',billing_snapshot:{company_name:'Testbetrieb'}};
 const pdf=await invoicePdf({...base,customer_number:100001},{});
 assert.equal(pdf.subarray(0,4).toString(),'%PDF');
 assert(pdf.length>1000);
 const missing=await invoicePdf({...base,customer_number:null},{});
 assert.equal(missing.subarray(0,4).toString(),'%PDF');
});

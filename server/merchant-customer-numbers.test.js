import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateMerchantCustomerNumbers} from './merchant-customer-numbers.js';
import {invoicePdf} from './billing-mail.js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {readFile} from 'node:fs/promises';

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
 async function text(bytes){
  const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
  try {const doc=await loading.promise;let result='';for(let i=1;i<=doc.numPages;i++)result+=(await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');return result;}
  finally {await loading.destroy();}
 }
 assert.match(await text(pdf),/Kundennummer: 100001/);
 assert.match(await text(pdf),/BN-TEST-2026/);
 const missing=await invoicePdf({...base,customer_number:null},{});
 assert.equal(missing.subarray(0,4).toString(),'%PDF');
 assert.doesNotMatch(await text(missing),/Kundennummer:/);
});


test('private SQL audit detects missing and duplicate numbers without returning identities',async()=>{
 const db=new PGlite();
 try {
  const sql=await readFile(new URL('../ops/sql/verify-merchant-customer-numbers.sql',import.meta.url),'utf8');
  await db.exec('CREATE TABLE companies(customer_number bigint); INSERT INTO companies VALUES(100001),(100002);');
  const audit=async()=> (await db.query(sql)).rows;
  assert.deepEqual(await audit(),[{all_merchants_numbered:true,numbers_unique:true}]);
  await db.exec('INSERT INTO companies VALUES(NULL)');
  assert.deepEqual(await audit(),[{all_merchants_numbered:false,numbers_unique:true}]);
  await db.exec('INSERT INTO companies VALUES(100001)');
  assert.deepEqual(await audit(),[{all_merchants_numbered:false,numbers_unique:false}]);
 } finally {await db.close()}
});

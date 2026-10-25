import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {downloadFixture,seller} from './download-fixture.mjs';
import {downloadInvoiceDescription,downloadInvoiceModel,downloadInvoiceDigest,readShopDownloadInvoicePreview} from '../../server/shop-download-invoice.js';
import {renderShopDownloadInvoicePreview,shopDownloadInvoicePreviewResponse} from '../../server/shop-download-invoice-view.js';
import {auditShopDownloadFulfilments} from '../../server/shop-download-audit.js';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const sample=()=>({version:1,checkoutId:crypto.randomUUID(),invoiceNumber:'BN-2026-001000',invoiceDate:'2026-10-24',serviceDate:'2026-10-24',description:downloadInvoiceDescription,quantity:1,vatRate:19,seller,product:{productId:'pos-download',planCode:'download_license',period:'once',currency:'EUR',netCents:39900,vatCents:7581,grossCents:47481},buyer:{company_name:'Synthetic buyer',street:'Example 1',postal_code:'10115',city:'Berlin',country:'DE'}});
test('invoice model is canonical and whitelists historical document data',()=>{
 const s=sample(),model=downloadInvoiceModel(s);assert.deepEqual(model,s);
 assert.equal(downloadInvoiceDigest({...s,product:Object.fromEntries(Object.entries(s.product).reverse())}),downloadInvoiceDigest(s));
 const result=downloadInvoiceModel({...s,session_hash:'private',provider_payment_id:'private',seller:{...s.seller,secret:'private'},buyer:{...s.buyer,email:'private'},product:{...s.product,private:'private'}});
 assert.equal(JSON.stringify(result).includes('private'),false);
 for(const patch of [{invoiceNumber:'BN-2027-001000'},{invoiceDate:'2026-02-30'},{serviceDate:'2026-10-25'},{quantity:2},{vatRate:7},{description:'Changed'},{checkoutId:'bad'},{product:{...s.product,grossCents:1}},{seller:{...s.seller,taxId:''}},{buyer:{...s.buyer,country:'FR'}}])assert.throws(()=>downloadInvoiceModel({...s,...patch}));
});
test('HTML preview escapes hostile fields, has no active/external content and prints its warning',()=>{
 const s=sample();s.seller.name='<script>alert(1)</script>';s.buyer.street='<img src="https://evil.test/" onerror="alert(1)">';s.buyer.company_name='A&B "Ltd"';
 const html=renderShopDownloadInvoicePreview(s),dom=new JSDOM(html),d=dom.window.document;
 assert.equal(d.querySelectorAll('script,img,iframe,form,a,link,object,embed').length,0);assert.ok(d.body.textContent.includes(s.seller.name));assert.ok(d.body.textContent.includes(s.buyer.street));
 assert.equal(d.querySelector('.shop-status').dataset.tone,'warning');assert.match(d.querySelector('footer').textContent,/keine ausgestellte Rechnung/);
 for(const amount of ['399,00','75,81','474,81'])assert.ok(d.body.textContent.includes(amount));
 assert.equal(d.querySelector('html').lang,'de');assert.equal(d.querySelectorAll('th[scope="col"]').length,2);assert.match(d.querySelector('style').textContent,/@media print/);
 const env=shopDownloadInvoicePreviewResponse(s);assert.equal(env.headers['Cache-Control'],'private, no-store');assert.equal(env.headers['X-Frame-Options'],'DENY');assert.match(env.headers['Content-Security-Policy'],/frame-ancestors 'none'/);assert.equal(env.digest,downloadInvoiceDigest(s));
 const style=d.querySelector('style').textContent,hash=crypto.createHash('sha256').update(style).digest('base64');assert.ok(env.headers['Content-Security-Policy'].includes(hash));assert.ok(d.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes(hash));
 dom.window.close();
});
test('preview reader requires owner/admin and never leaks another company or internal references',async()=>{
 const f=await downloadFixture();try{
  const read=(extra={})=>readShopDownloadInvoicePreview(f.pool,{token:'owner-a',id:f.order.id,...extra});
  await assert.rejects(read(),{code:'INVOICE_NOT_READY'});await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();
  for(const [token,code]of [['owner-b','CHECKOUT_NOT_FOUND'],['waiter','FORBIDDEN'],['expired','UNAUTHORIZED'],['inactive','UNAUTHORIZED'],['reset','UNAUTHORIZED']])await assert.rejects(read({token}),{code});
  const first=await read();assert.equal(first.kind,'invoice_preview');assert.equal(first.canActivate,false);assert.equal(first.invoiceDelivered,false);
  for(const key of ['session_hash','company_id','provider_payment_id','entitlement_id','billing_transaction_id'])assert.equal(JSON.stringify(first).includes(key),false);
  await f.db.exec("UPDATE company_billing_profiles SET company_name='Changed';UPDATE billing_plans SET amount_cents=1");assert.deepEqual(await read(),first);
  await f.db.exec("UPDATE company_entitlements SET status='canceled'");assert.deepEqual(await read(),first);await assert.rejects(f.run(),{code:'FULFILMENT_MISMATCH'});
  assert.equal((await f.db.query('SELECT status FROM company_entitlements')).rows[0].status,'canceled');
 }finally{await f.db.close();}
});
test('stored invoice date, provider links, guard and job are audited before replay or preview',async t=>{
 const cases=["UPDATE billing_transactions SET invoice_date='2026-01-01'","UPDATE company_entitlements SET provider='other'","UPDATE billing_checkout_guards SET status='open'","UPDATE shop_license_jobs SET status='pending'"];
 for(const sql of cases)await t.test(sql,async()=>{
  const f=await downloadFixture();try{
   await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();
   assert.equal((await auditShopDownloadFulfilments(f.pool,{enabled:true})).items[0].consistent,true);
   await f.db.exec(sql);await assert.rejects(f.run(),{code:'FULFILMENT_MISMATCH'});await assert.rejects(readShopDownloadInvoicePreview(f.pool,{token:'owner-a',id:f.order.id}),{code:'FULFILMENT_MISMATCH'});
   const audit=await auditShopDownloadFulfilments(f.pool,{enabled:true});assert.deepEqual(audit.items,[{id:f.order.id,consistent:false,code:'FULFILMENT_MISMATCH'}]);assert.equal(audit.providerVerified,false);assert.equal(audit.canRepair,false);
   assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,1);
  }finally{await f.db.close();}
 });
});
test('operator inspection is disabled, bounded, read-only and keyset-filtered',async()=>{
 await assert.rejects(auditShopDownloadFulfilments({}),{code:'AUDIT_DISABLED'});
 for(const options of [{limit:0},{limit:101},{limit:1.5},{after:'bad'}])await assert.rejects(auditShopDownloadFulfilments({},{enabled:true,...options}),{code:'INVALID_REQUEST'});
 const f=await downloadFixture();try{
  await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();
  const audit=await auditShopDownloadFulfilments(f.pool,{enabled:true,limit:1});assert.equal(audit.items.length,1);assert.equal(audit.next,null);
  assert.deepEqual((await auditShopDownloadFulfilments(f.pool,{enabled:true,after:f.order.id})).items,[]);
  for(const key of ['session_hash','company_id','invoiceNumber','provider_payment_id','buyer','seller'])assert.equal(JSON.stringify(audit).includes(key),false);
  const broken={connect:async()=>{const c=await f.pool.connect();return {...c,query(sql,args){if(sql.startsWith('SELECT * FROM billing_transactions'))throw Error('injected database failure');return c.query(sql,args);}};}};
  await assert.rejects(auditShopDownloadFulfilments(broken,{enabled:true}),/injected database failure/);assert.equal((await f.run()).replay,true);
 }finally{await f.db.close();}
});
test('additive migration never invents a missing historical document digest',async()=>{
 const f=await downloadFixture();try{
  await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();
  // Reproduce the immediately preceding schema, which had no digest column.
  await f.db.exec('ALTER TABLE shop_download_fulfilments DROP COLUMN document_digest');
  const {migrateShopDownloadFulfilment}=await import('../../server/shop-download-fulfilment.js');await migrateShopDownloadFulfilment(f.pool);
  assert.equal((await f.db.query('SELECT document_digest FROM shop_download_fulfilments')).rows[0].document_digest,null);
  await assert.rejects(f.run(),{code:'FULFILMENT_MISMATCH'});await assert.rejects(readShopDownloadInvoicePreview(f.pool,{token:'owner-a',id:f.order.id}),{code:'FULFILMENT_MISMATCH'});
  assert.equal((await auditShopDownloadFulfilments(f.pool,{enabled:true})).items[0].consistent,false);
  await assert.rejects(f.db.exec("UPDATE shop_download_fulfilments SET document_digest=repeat('0',64)"),/SHOP_DOWNLOAD_IMMUTABLE/);
 }finally{await f.db.close();}
});

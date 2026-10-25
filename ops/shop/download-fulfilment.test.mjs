import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadFixture as setup} from './download-fixture.mjs';
import {fulfilShopLiveDownload} from '../../server/shop-download-fulfilment.js';
import {allowDownloadPdf,berlinInvoiceDate} from '../../server/shop-download-policy.js';
test('disabled executor accesses neither database nor provider',async()=>{
 await assert.rejects(fulfilShopLiveDownload({},{}),{code:'FULFILMENT_DISABLED'});
});
test('invoice format gate is explicit and bounded; Berlin date respects midnight',()=>{
 assert.equal(berlinInvoiceDate('2026-10-24T23:30:00Z'),'2026-10-25');
 allowDownloadPdf({date:'2026-12-31',consent:true});
 for(const date of ['2027-01-01','2026-02-30','2024-12-31','bad'])assert.throws(()=>allowDownloadPdf({date,consent:true}));
 assert.throws(()=>allowDownloadPdf({date:'2026-10-24',consent:false}),{code:'INVOICE_FORMAT_NOT_READY'});
});
test('TEST cannot grant; synthetic LIVE fixture writes once with immutable snapshots',async()=>{
 const f=await setup();try{
  await assert.rejects(f.run(),{code:'LIVE_PAYMENT_REQUIRED'});
  await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");
  await f.db.exec("UPDATE company_billing_profiles SET company_name='Changed buyer'");
  const first=await f.run(),again=await f.run();assert.equal(first.replay,false);assert.equal(again.replay,true);assert.equal(first.invoiceNumber,again.invoiceNumber);assert.equal(first.entitlementId,again.entitlementId);assert.equal(first.invoiceDelivered,false);
  const stored=(await f.db.query('SELECT * FROM shop_download_fulfilments')).rows[0];assert.equal(stored.snapshot.buyer.company_name,'Fixture Company');
  assert.equal((await f.db.query('SELECT amount_cents FROM billing_transactions')).rows[0].amount_cents,47481);
  assert.equal((await f.db.query('SELECT status FROM shop_license_jobs')).rows[0].status,'done');
  assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'resolved');
  for(const table of ['shop_download_invoice_consents','shop_download_fulfilments'])for(const sql of [`DELETE FROM ${table}`,`UPDATE ${table} SET company_id=company_id`])await assert.rejects(f.db.exec(sql),/SHOP_DOWNLOAD_IMMUTABLE/);
  await f.db.exec("UPDATE billing_transactions SET amount_cents=1");await assert.rejects(f.run(),{code:'FULFILMENT_MISMATCH'});
 }finally{await f.db.close();}
});
test('fresh proof rejects TEST, refunds, customer reuse and invalid payment times',async()=>{
 const f=await setup();try{await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");
  for(const patch of [{mode:'test'},{status:'open'},{customerId:'cst_foreign'},{paidAt:'bad'},{paidAt:'2099-01-01T00:00:00Z'},{amountRefunded:{currency:'EUR',value:'1.00'}}])await assert.rejects(f.run({fetchPayment:async()=>({...f.proof,...patch})}),{code:'PROVIDER_MISMATCH'});
  assert.equal((await f.db.query('SELECT 1 FROM company_entitlements')).rows.length,0);
 }finally{await f.db.close();}
});
test('every business write rolls back together and can retry',async t=>{
 for(const prefix of ['INSERT INTO billing_transactions','INSERT INTO company_entitlements','INSERT INTO shop_download_fulfilments','UPDATE shop_license_jobs','UPDATE billing_checkout_guards'])await t.test(prefix,async()=>{
  const f=await setup();try{await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");
   const faulty={...f.pool,connect:async()=>{const c=await f.pool.connect();return {...c,query(sql,args){if(sql.startsWith(prefix))throw Error('injected failure');return c.query(sql,args);}};}};
   await assert.rejects(fulfilShopLiveDownload(faulty,{id:f.order.id,enabled:true,fetchPayment:async()=>f.proof}),/injected failure/);
   for(const table of ['billing_transactions','company_entitlements','shop_download_fulfilments'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
   assert.equal((await f.db.query('SELECT status FROM shop_license_jobs')).rows[0].status,'pending');assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'open');
   assert.equal((await f.run()).replay,false);
  }finally{await f.db.close();}
 });
});
test('existing licences and incomplete buyer data block all business writes',async t=>{
 for(const sql of ["INSERT INTO company_entitlements(id,company_id,plan_id,status) SELECT gen_random_uuid(),company_id,plan_id,'active' FROM billing_checkout_guards", "UPDATE shop_checkout_orders SET billing_snapshot='{}'::jsonb", "UPDATE shop_license_jobs SET status='done'"])await t.test(sql,async()=>{
  const f=await setup();try{await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.db.exec(sql);await assert.rejects(f.run());assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM shop_download_fulfilments')).rows.length,0);}finally{await f.db.close();}
 });
});

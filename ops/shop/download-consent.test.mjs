import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadFixture,seller} from './download-fixture.mjs';
import {migrateShopDownloadFulfilment} from '../../server/shop-download-fulfilment.js';
import {downloadConsentDigest} from '../../server/shop-download-consent.js';

test('presentation has exact data and no implied consent; authentication applies to reads and writes',async()=>{
 const f=await downloadFixture({accept:false,paid:false});try{
  assert.equal(f.view.accepted,false);assert.equal(f.view.canPay,false);assert.equal(f.view.canActivate,false);assert.equal(f.view.product.grossCents,47481);assert.deepEqual(f.view.seller,seller);assert.match(f.view.text,/PDF/);
  for(const [token,code] of [['owner-b','CHECKOUT_NOT_FOUND'],['waiter','FORBIDDEN'],['expired','UNAUTHORIZED'],['reset','UNAUTHORIZED'],['inactive','UNAUTHORIZED']]){
   await assert.rejects(f.readConsent({token}),{code});await assert.rejects(f.consent({token}),{code});
  }
  await assert.rejects(f.consent({accepted:false}),{code:'INVOICE_CONSENT_REQUIRED'});
  for(const acceptedDigest of [undefined,'','x'.repeat(64),'0'.repeat(64)])await assert.rejects(f.consent({acceptedDigest}),{code:'INVOICE_CONSENT_CHANGED'});
  await assert.rejects(f.consent({seller:{...seller,name:'Changed seller'}}),{code:'INVOICE_CONSENT_CHANGED'});
  assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,0);
  assert.equal((await f.consent()).replay,false);assert.equal((await f.consent()).replay,true);
  await assert.rejects(f.consent({seller:{...seller,name:'Changed seller'}}),{code:'REQUEST_CONFLICT'});
  const row=(await f.db.query('SELECT * FROM shop_download_invoice_consents')).rows[0];assert.equal(row.buyer_snapshot.company_name,'Fixture Company');assert.equal(row.consent_digest,f.view.digest);
  await migrateShopDownloadFulfilment(f.pool);assert.equal((await f.consent()).replay,true);
 }finally{await f.db.close();}
});
test('content digest is canonical and binds buyer, seller, amounts, terms deadline and checkout',async()=>{
 const f=await downloadFixture({accept:false,paid:false});try{
  assert.equal(downloadConsentDigest({...f.view,product:Object.fromEntries(Object.entries(f.view.product).reverse()),buyer:Object.fromEntries(Object.entries(f.view.buyer).reverse())}),f.view.digest);
  for(const patch of [{id:f.draft.id},{seller:{...seller,taxId:'Changed tax identity'}},{buyer:{...f.view.buyer,street:'Changed 2'}},{expiresAt:'2026-12-31T00:00:00Z'},{product:{...f.view.product,netCents:100,vatCents:19,grossCents:119}}])assert.notEqual(downloadConsentDigest({...f.view,...patch}),f.view.digest);
 }finally{await f.db.close();}
});
test('changed current profile requires new preparation; expired draft cannot record consent',async()=>{
 const f=await downloadFixture({accept:false,paid:false});try{
  await f.db.exec("UPDATE company_billing_profiles SET company_name='Changed'");await assert.rejects(f.readConsent(),{code:'PROFILE_CHANGED'});await assert.rejects(f.consent(),{code:'PROFILE_CHANGED'});
  await f.db.exec("UPDATE company_billing_profiles SET company_name='Fixture Company';UPDATE shop_order_drafts SET created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second'");
  await assert.rejects(f.readConsent(),{code:'DRAFT_INELIGIBLE'});await assert.rejects(f.consent(),{code:'DRAFT_INELIGIBLE'});
  assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,0);
 }finally{await f.db.close();}
});
test('consent is required before business effects and missing legacy columns never infer agreement',async()=>{
 const f=await downloadFixture({accept:false,paid:true});try{
  await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await assert.rejects(f.run(),{code:'INVOICE_CONSENT_REQUIRED'});
  // Simulate an older immutable row: only migrations may add nullable metadata;
  // they must not manufacture a buyer snapshot, digest or historical acceptance.
  await f.db.exec('ALTER TABLE shop_download_invoice_consents ALTER COLUMN buyer_snapshot DROP NOT NULL, ALTER COLUMN consent_digest DROP NOT NULL, ALTER COLUMN consent_expires_at DROP NOT NULL');
  await f.db.query("INSERT INTO shop_download_invoice_consents(checkout_id,company_id,session_hash,seller_snapshot,order_snapshot,consent_version) SELECT id,company_id,session_hash,$1,snapshot,'pdf-domestic-b2b-v1' FROM shop_checkout_orders",[JSON.stringify(seller)]);
  await migrateShopDownloadFulfilment(f.pool);await assert.rejects(f.run(),{code:'INVOICE_CONSENT_REQUIRED'});
  assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,0);
 }finally{await f.db.close();}
});
test('late consent after dispatch cannot be added retroactively',async()=>{
 const f=await downloadFixture({accept:false,paid:true});try{await assert.rejects(f.consent(),{code:'CHECKOUT_PENDING'});await assert.rejects(f.readConsent(),{code:'CHECKOUT_PENDING'});}finally{await f.db.close();}
});
test('new consent cannot confirm a stale price even inside the draft deadline',async()=>{
 const f=await downloadFixture({accept:false,paid:false});try{
  await f.db.exec("UPDATE billing_plans SET amount_cents=40000 WHERE code='download_license'");await assert.rejects(f.readConsent(),{code:'PRICE_CHANGED'});await assert.rejects(f.consent(),{code:'PRICE_CHANGED'});
  assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,0);
 }finally{await f.db.close();}
});

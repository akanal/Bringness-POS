import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';import {migrateShopDrafts,saveShopDraft} from '../../server/shop-drafts.js';import {migrateShopCheckouts,prepareShopCheckout} from '../../server/shop-checkout-orders.js';import {dispatchPreparedShopCheckout} from '../../server/shop-checkout-dispatch.js';
import {supportedDownloadBuyer,supportedDownloadInvoiceDate,downloadInvoiceDate} from '../../server/shop-download-invoice-readiness.js';
import {downloadSnapshot,allowDownloadPdf,berlinInvoiceDate} from '../../server/shop-download-policy.js';
test('shared invoice readiness preserves existing historical policy and explicit consent requirement',()=>{
 const buyer={company_name:'Fixture',street:'Street 1',postal_code:'10115',city:'Berlin',country:'DE'},snapshot={productId:'pos-download',planCode:'download_license',period:'once',currency:'EUR',netCents:39900,vatCents:7581,grossCents:47481};
 for(const patch of [{},{country:' germany '},{country:'AT'},{street:'x'},{city:'Bad\nCity'},{postal_code:'x'.repeat(501)}]){
  const b={...buyer,...patch};if(supportedDownloadBuyer(b))assert.deepEqual(downloadSnapshot({snapshot,billing_snapshot:b}).buyer,b);else assert.throws(()=>downloadSnapshot({snapshot,billing_snapshot:b}),{code:'BUYER_PROFILE_UNSUPPORTED'});
 }
 for(const date of ['2025-01-01','2026-12-31','2027-01-01','2024-12-31','2026-02-30',null,17]){
  if(supportedDownloadInvoiceDate(date))allowDownloadPdf({date,consent:true});else assert.throws(()=>allowDownloadPdf({date,consent:true}),{code:'INVOICE_FORMAT_NOT_READY'});
  assert.throws(()=>allowDownloadPdf({date,consent:false}),{code:'INVOICE_FORMAT_NOT_READY'});
 }
 assert.equal(downloadInvoiceDate('invalid'),null);assert.throws(()=>berlinInvoiceDate('invalid'),{code:'INVALID_INVOICE_DATE'});assert.equal(berlinInvoiceDate('2026-12-31T23:00:00Z'),'2027-01-01');
});
test('unsupported Windows buyer blocks draft and later changed profile blocks transport',async()=>{
 const f=await fixture();try{
  await migrateShopDrafts(f.pool);await migrateShopCheckouts(f.pool);
  await f.db.query("UPDATE company_billing_profiles SET country='AT' WHERE company_id=$1",[f.a]);
  await assert.rejects(saveShopDraft(f.pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}}),{code:'DRAFT_INELIGIBLE'});
  assert.equal((await f.db.query('SELECT 1 FROM shop_order_drafts')).rows.length,0);
  await f.db.query("UPDATE company_billing_profiles SET country='DE' WHERE company_id=$1",[f.a]);
  const d=await saveShopDraft(f.pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}}),l=d.snapshot.lines[0],o=await prepareShopCheckout(f.pool,{token:'owner-a',draftId:d.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});let calls=0;
  await f.db.query("UPDATE company_billing_profiles SET country='AT' WHERE company_id=$1",[f.a]);
  await assert.rejects(dispatchPreparedShopCheckout(f.pool,{id:o.id,submit:async()=>{calls++;}}),{code:'PRICE_CHANGED'});
  assert.equal(calls,0);assert.equal((await f.db.query('SELECT status,dispatch_started_at FROM shop_checkout_orders')).rows[0].status,'prepared');assert.equal((await f.db.query('SELECT dispatch_started_at FROM shop_checkout_orders')).rows[0].dispatch_started_at,null);
  assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'creating');
  for(const table of ['company_entitlements','billing_transactions'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
 }finally{await f.db.close();}
});

import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';import {downloadFixture} from './download-fixture.mjs';import {payment} from './provider-fixture.mjs';
import {migrateShopDrafts,saveShopDraft} from '../../server/shop-drafts.js';import {migrateShopCheckouts,prepareShopCheckout} from '../../server/shop-checkout-orders.js';import {dispatchPreparedShopCheckout} from '../../server/shop-checkout-dispatch.js';import {downloadConsentDigest} from '../../server/shop-download-consent.js';
test('Windows dispatch without consent schema fails closed before transport or dispatch state',async()=>{
 const f=await fixture();try{await migrateShopDrafts(f.pool);await migrateShopCheckouts(f.pool);
  const d=await saveShopDraft(f.pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}}),l=d.snapshot.lines[0],o=await prepareShopCheckout(f.pool,{token:'owner-a',draftId:d.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});let calls=0;
  await assert.rejects(dispatchPreparedShopCheckout(f.pool,{id:o.id,submit:async()=>{calls++;}}),{code:'INVOICE_CONSENT_REQUIRED'});assert.equal(calls,0);
  const row=(await f.db.query('SELECT status,dispatch_started_at FROM shop_checkout_orders')).rows[0];assert.equal(row.status,'prepared');assert.equal(row.dispatch_started_at,null);
 }finally{await f.db.close();}
});
test('only a bound timely explicit PDF receipt permits one Windows payment submission',async()=>{
 const f=await downloadFixture({accept:false,paid:false});let calls=0;
 const run=pool=>dispatchPreparedShopCheckout(pool,{id:f.order.id,submit:async c=>{calls++;return payment(c);}});
 try{
  await assert.rejects(run(f.pool),{code:'INVOICE_CONSENT_REQUIRED'});assert.equal(calls,0);await f.consent();
  const created=(await f.db.query('SELECT created_at FROM shop_checkout_orders')).rows[0].created_at;
  const changes=[r=>({...r,consent_digest:'0'.repeat(64)}),r=>({...r,company_id:f.b}),r=>({...r,checkout_id:crypto.randomUUID()}),r=>({...r,buyer_snapshot:{...r.buyer_snapshot,city:'Changed'}}),r=>({...r,seller_snapshot:{...r.seller_snapshot,taxId:'CHANGED'}}),r=>({...r,consent_version:'unknown'}),r=>({...r,created_at:new Date(new Date(created).getTime()-1000)}),r=>({...r,created_at:new Date(Date.now()+60000)}),r=>{
   const expiresAt=new Date(new Date(created).getTime()+1).toISOString();return {...r,created_at:created,consent_expires_at:expiresAt,consent_digest:downloadConsentDigest({id:r.checkout_id,seller:r.seller_snapshot,product:r.order_snapshot,buyer:r.buyer_snapshot,expiresAt})};
  }];
  for(const change of changes){
   const pool={...f.pool,connect:async()=>{const db=await f.pool.connect();return {...db,query:async(sql,args)=>{const result=await db.query(sql,args);return sql.startsWith('SELECT * FROM shop_download_invoice_consents')?{...result,rows:result.rows.map(change)}:result;}};}};
   await assert.rejects(run(pool),{code:'INVOICE_CONSENT_REQUIRED'});assert.equal(calls,0);
   const row=(await f.db.query('SELECT status,dispatch_started_at FROM shop_checkout_orders')).rows[0];assert.equal(row.status,'prepared');assert.equal(row.dispatch_started_at,null);assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'creating');
   for(const table of ['company_entitlements','billing_transactions','shop_license_jobs'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
  }
  assert.equal((await run(f.pool)).status,'open');assert.equal(calls,1);await assert.rejects(run(f.pool),{code:'CHECKOUT_PENDING'});assert.equal(calls,1);
 }finally{await f.db.close();}
});

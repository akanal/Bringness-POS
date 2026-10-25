import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';import {payment} from './provider-fixture.mjs';import {migrateShopDrafts,saveShopDraft} from '../../server/shop-drafts.js';import {migrateShopCheckouts,prepareShopCheckout,abandonShopCheckout,readShopCheckout} from '../../server/shop-checkout-orders.js';import {dispatchPreparedShopCheckout,attachVerifiedShopPayment} from '../../server/shop-checkout-dispatch.js';import {migrateShopPaymentStatus,reconcileShopTestPayment} from '../../server/shop-payment-status.js';
const inject=(pool,prefix)=>({...pool,connect:async()=>{const c=await pool.connect();return {...c,query(s,p){if(s.startsWith(prefix))throw Error('injected database failure');return c.query(s,p);}};}});
test('internal TEST dispatch/reconciliation lifecycle and failures',async t=>{
 const {pool,db,a}=await fixture();let calls=0;const commands=new Map();const submit=async c=>{calls++;commands.set(c.orderId,c);return payment(c);};
 const row=async id=>(await db.query('SELECT * FROM shop_checkout_orders WHERE id=$1',[id])).rows[0];
 async function create(token='owner-a'){const draft=await saveShopDraft(pool,{token,requestId:crypto.randomUUID(),cart:{'pos-online':1}});const l=draft.snapshot.lines[0];return prepareShopCheckout(pool,{token,draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});}
 async function resolveFailed(order,status='failed'){const c=commands.get(order.id);return reconcileShopTestPayment(pool,{id:order.id,fetchPayment:async()=>payment(c,status)});}
 try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopPaymentStatus(pool);let order=await create();
 await t.test('original session, fresh profile and price checked before network',async()=>{
  await db.query("UPDATE users SET role='manager' WHERE company_id=$1 AND role='owner'",[a]);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit}),{code:'FORBIDDEN'});await db.query("UPDATE users SET role='owner' WHERE company_id=$1 AND role='manager'",[a]);
  await db.query('UPDATE company_billing_terms SET monthly_net_cents=1999 WHERE company_id=$1',[a]);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit}),{code:'PRICE_CHANGED'});await db.query('UPDATE company_billing_terms SET monthly_net_cents=2999 WHERE company_id=$1',[a]);
  for(const invalid of ['x'.repeat(501),'Bad\nStreet']){
   await db.query('UPDATE company_billing_profiles SET street=$2 WHERE company_id=$1',[a,invalid]);
   await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit}),{code:'PRICE_CHANGED'});
   assert.equal(calls,0);assert.equal((await row(order.id)).status,'prepared');
  }
  await db.query("UPDATE company_billing_profiles SET street='Example 1' WHERE company_id=$1",[a]);
  await db.query("UPDATE company_billing_profiles SET street='Changed' WHERE company_id=$1",[a]);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit}),{code:'PROFILE_CHANGED'});await db.query("UPDATE company_billing_profiles SET street='Example 1' WHERE company_id=$1",[a]);assert.equal(calls,0);assert.equal((await row(order.id)).status,'prepared');
 });
 await t.test('uncertain state is committed before single provider call',async()=>{const r=await dispatchPreparedShopCheckout(pool,{id:order.id,submit:async c=>{assert.equal((await row(order.id)).status,'uncertain');assert.ok(Object.isFrozen(c));assert.ok(Object.isFrozen(c.billing));return submit(c);}});assert.equal(r.status,'open');assert.equal(calls,1);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit}),{code:'CHECKOUT_PENDING'});assert.equal(calls,1);await assert.rejects(abandonShopCheckout(pool,{token:'owner-a',id:order.id}),{code:'CHECKOUT_PENDING'});});
 await t.test('public recovery never leaks private evidence',async()=>{const r=await readShopCheckout(pool,{token:'owner-a',id:order.id});for(const key of['session_hash','checkout_url','billing_snapshot','provider_customer_id'])assert.equal(r[key],undefined);assert.ok(!JSON.stringify(r).includes('fixture@example.test'));});
 await t.test('foreign proof and LIVE proof cannot update order',async()=>{const c=commands.get(order.id);for(const p of[{...payment(c,'paid'),mode:'live'},{...payment(c,'paid'),metadata:{shopCompanyId:crypto.randomUUID()}},{...payment(c,'paid'),amount:{currency:'EUR',value:'0.01'}}])await assert.rejects(reconcileShopTestPayment(pool,{id:order.id,fetchPayment:async()=>p}),{code:'PROVIDER_MISMATCH'});assert.equal((await row(order.id)).status,'open');});
 await t.test('licence-intent write failure rolls payment reconciliation back',async()=>{const c=commands.get(order.id);await assert.rejects(reconcileShopTestPayment(inject(pool,'INSERT INTO shop_license_jobs'),{id:order.id,fetchPayment:async()=>payment(c,'paid')}),/injected database/);assert.equal((await row(order.id)).status,'open');assert.equal((await db.query('SELECT 1 FROM shop_license_jobs')).rows.length,0);});
 await t.test('paid TEST proof queues exactly one intent; guard stays open',async()=>{const c=commands.get(order.id);for(let n=0;n<2;n++){const r=await reconcileShopTestPayment(pool,{id:order.id,fetchPayment:async()=>payment(c,'paid')});assert.equal(r.status,'paid');assert.equal(r.licence,'pending');assert.equal(r.canActivate,false);}assert.equal((await db.query('SELECT 1 FROM shop_license_jobs')).rows.length,1);assert.equal((await db.query('SELECT status FROM billing_checkout_guards WHERE id=$1',[(await row(order.id)).guard_id])).rows[0].status,'open');await assert.rejects(resolveFailed(order),{code:'PAYMENT_REGRESSION'});});
 // Different company permits independent lifecycle while first paid licence is pending.
 order=await create('owner-b');
 await t.test('network exception retains reservation and never redispatches later',async()=>{await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit:async c=>{calls++;commands.set(c.orderId,c);throw Error('private diagnostic');}}),{code:'PROVIDER_UNCERTAIN'});const n=calls;await db.query("UPDATE shop_checkout_orders SET dispatch_started_at=clock_timestamp()-interval '2 days' WHERE id=$1",[order.id]);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit}),{code:'CHECKOUT_PENDING'});assert.equal(calls,n);await assert.rejects(abandonShopCheckout(pool,{token:'owner-b',id:order.id}),{code:'CHECKOUT_PENDING'});});
 await t.test('matching fetched proof can attach without another provider POST',async()=>{const p=payment(commands.get(order.id));await assert.rejects(attachVerifiedShopPayment(inject(pool,"UPDATE shop_checkout_orders SET status='open'"),{id:order.id,payment:p}),/injected database/);assert.equal((await row(order.id)).status,'uncertain');assert.equal((await db.query('SELECT status FROM billing_checkout_guards WHERE id=$1',[(await row(order.id)).guard_id])).rows[0].status,'creating');const n=calls;await attachVerifiedShopPayment(pool,{id:order.id,payment:p});await attachVerifiedShopPayment(pool,{id:order.id,payment:p});assert.equal(calls,n);assert.equal((await row(order.id)).status,'open');});
 await t.test('terminal failure resolves guard and draft with exact replay',async()=>{assert.equal((await resolveFailed(order,'expired')).status,'failed');assert.equal((await resolveFailed(order,'expired')).status,'failed');await assert.rejects(resolveFailed(order,'paid'),{code:'PAYMENT_REGRESSION'});assert.equal((await db.query('SELECT status FROM shop_order_drafts WHERE id=$1',[order.draftId])).rows[0].status,'canceled');assert.equal((await db.query('SELECT status FROM billing_checkout_guards WHERE id=$1',[(await row(order.id)).guard_id])).rows[0].status,'resolved');});
 await t.test('no production financial writes or licence activations',async()=>{assert.equal((await db.query('SELECT 1 FROM company_entitlements')).rows.length,0);assert.equal((await db.query('SELECT 1 FROM billing_transactions')).rows.length,0);assert.equal((await db.query("SELECT 1 FROM shop_license_jobs WHERE status='done'")).rows.length,0);});
 }finally{await db.close();}
});

test('corrupt stored product totals cannot attach proof or queue licence work',async()=>{
 const {pool,db}=await fixture();try{
  await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopPaymentStatus(pool);
  const d=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}}),l=d.snapshot.lines[0];
  const order=await prepareShopCheckout(pool,{token:'owner-a',draftId:d.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});let command;
  await assert.rejects(dispatchPreparedShopCheckout(pool,{id:order.id,submit:async c=>{command=c;throw Error('lost reply');}}),{code:'PROVIDER_UNCERTAIN'});
  const original=(await db.query('SELECT snapshot FROM shop_checkout_orders WHERE id=$1',[order.id])).rows[0].snapshot;
  for(const patch of [{netCents:original.netCents-1},{vatCents:original.vatCents+1},{planCode:'download_license'},{productId:'pos-download'}]){
   await db.query('UPDATE shop_checkout_orders SET snapshot=$2::jsonb WHERE id=$1',[order.id,JSON.stringify({...original,...patch})]);
   await assert.rejects(attachVerifiedShopPayment(pool,{id:order.id,payment:payment(command)}),{code:'PROVIDER_MISMATCH'});
   assert.equal((await db.query('SELECT status FROM shop_checkout_orders WHERE id=$1',[order.id])).rows[0].status,'uncertain');
  }
  await db.query('UPDATE shop_checkout_orders SET snapshot=$2::jsonb WHERE id=$1',[order.id,JSON.stringify(original)]);
  await attachVerifiedShopPayment(pool,{id:order.id,payment:payment(command)});
  await db.query('UPDATE shop_checkout_orders SET snapshot=$2::jsonb WHERE id=$1',[order.id,JSON.stringify({...original,vatCents:original.vatCents+1})]);
  await assert.rejects(reconcileShopTestPayment(pool,{id:order.id,fetchPayment:async()=>payment(command,'paid')}),{code:'PROVIDER_MISMATCH'});
  assert.equal((await db.query('SELECT status FROM shop_checkout_orders WHERE id=$1',[order.id])).rows[0].status,'open');
  for(const table of ['shop_license_jobs','company_entitlements','billing_transactions'])assert.equal((await db.query('SELECT 1 FROM '+table)).rows.length,0);
 }finally{await db.close();}
});

test('payment reservation remains plan-bound before dispatch, on attachment replay and reconciliation',async()=>{
 const {pool,db,download}=await fixture();try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopPaymentStatus(pool);
  const d=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}}),l=d.snapshot.lines[0],o=await prepareShopCheckout(pool,{token:'owner-a',draftId:d.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});
  const guard=(await db.query('SELECT * FROM billing_checkout_guards')).rows[0];let calls=0,command;
  await db.query('UPDATE billing_checkout_guards SET plan_id=$1',[download]);
  await assert.rejects(dispatchPreparedShopCheckout(pool,{id:o.id,submit:async()=>{calls++;}}),{code:'CHECKOUT_PENDING'});assert.equal(calls,0);
  await db.query('UPDATE billing_checkout_guards SET plan_id=$1',[guard.plan_id]);
  await assert.rejects(dispatchPreparedShopCheckout(pool,{id:o.id,submit:async c=>{calls++;command=c;throw Error('lost reply');}}),{code:'PROVIDER_UNCERTAIN'});
  const restore=()=>db.query('UPDATE billing_checkout_guards SET plan_id=$1,slot=$2,status=$3,provider_payment_id=$4',[guard.plan_id,'base','creating',null]);
  for(const [column,value] of [['plan_id',download],['slot','addon'],['status','resolved'],['provider_payment_id','tr_foreign']]){
   await restore();await db.query('UPDATE billing_checkout_guards SET '+column+'=$1',[value]);await assert.rejects(attachVerifiedShopPayment(pool,{id:o.id,payment:payment(command)}),{code:'CHECKOUT_PENDING'});
   assert.equal((await db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'uncertain');
  }
  await restore();await attachVerifiedShopPayment(pool,{id:o.id,payment:payment(command)});
  for(const [column,value] of [['plan_id',download],['slot','addon'],['status','resolved'],['provider_payment_id','tr_foreign']]){
   await db.query('UPDATE billing_checkout_guards SET plan_id=$1,slot=$2,status=$3,provider_payment_id=$4',[guard.plan_id,'base','open',payment(command).id]);
   await db.query('UPDATE billing_checkout_guards SET '+column+'=$1',[value]);
   const version=(await db.query('SELECT version FROM shop_test_payment_queue')).rows[0].version;
   await assert.rejects(attachVerifiedShopPayment(pool,{id:o.id,payment:payment(command)}),{code:'CHECKOUT_PENDING'});
   assert.equal((await db.query('SELECT version FROM shop_test_payment_queue')).rows[0].version,version);
   await assert.rejects(reconcileShopTestPayment(pool,{id:o.id,fetchPayment:async()=>payment(command,'paid')}),{code:'CHECKOUT_PENDING'});
   assert.equal((await db.query('SELECT 1 FROM shop_license_jobs')).rows.length,0);
  }
  await db.query('UPDATE billing_checkout_guards SET plan_id=$1,slot=$2,status=$3,provider_payment_id=$4',[guard.plan_id,'base','open',payment(command).id]);
  await reconcileShopTestPayment(pool,{id:o.id,fetchPayment:async()=>payment(command,'paid')});assert.equal((await db.query('SELECT 1 FROM shop_license_jobs')).rows.length,1);assert.equal(calls,1);
 }finally{await db.close();}
});

test('dispatch rejects invalid current contacts and whitelists the stored command snapshot',async()=>{
 const {pool,db,a,b}=await fixture();try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopPaymentStatus(pool);
  const d=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}}),l=d.snapshot.lines[0],o=await prepareShopCheckout(pool,{token:'owner-a',draftId:d.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});let calls=0;
  for(const email of ['@','name@','@example.test','a@@example.test','a b@example.test','a@example.test\n']){
   await db.query('UPDATE users SET email=$2 WHERE company_id=$1',[a,email]);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:o.id,submit:async()=>{calls++;}}),{code:'PROFILE_CHANGED'});
   assert.equal((await db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'prepared');assert.equal((await db.query('SELECT dispatch_started_at FROM shop_checkout_orders')).rows[0].dispatch_started_at,null);
  }
  await db.query("UPDATE users SET email='fixture@example.test',display_name='Bad'||chr(10)||'Name' WHERE company_id=$1",[a]);await assert.rejects(dispatchPreparedShopCheckout(pool,{id:o.id,submit:async()=>{calls++;}}),{code:'PROFILE_CHANGED'});
  assert.equal(calls,0);await db.query("UPDATE users SET display_name='Fixture Owner' WHERE company_id=$1",[a]);
  const snapshot=(await db.query('SELECT snapshot FROM shop_checkout_orders')).rows[0].snapshot;
  await db.query('UPDATE shop_checkout_orders SET snapshot=$1::jsonb',[JSON.stringify({...snapshot,orderId:crypto.randomUUID(),companyId:b,idempotencyKey:'foreign-key',privateNote:'must not leave database'})]);
  await dispatchPreparedShopCheckout(pool,{id:o.id,submit:async c=>{calls++;assert.equal(c.orderId,o.id);assert.equal(c.companyId,a);assert.equal(c.idempotencyKey,o.id+':payment');assert.equal(c.privateNote,undefined);return payment(c);}});assert.equal(calls,1);
 }finally{await db.close();}
});

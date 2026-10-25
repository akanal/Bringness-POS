import {acceptFixtureDownloadConsent} from './accept-download-consent-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';
import {payment} from './provider-fixture.mjs';
import {migrateShopDrafts,saveShopDraft} from '../../server/shop-drafts.js';
import {migrateShopCheckouts,prepareShopCheckout} from '../../server/shop-checkout-orders.js';
import {dispatchPreparedShopCheckout} from '../../server/shop-checkout-dispatch.js';
import {migrateShopPaymentStatus,reconcileShopTestPayment} from '../../server/shop-payment-status.js';
import {migrateShopTestFulfilment,rehearseShopTestFulfilment,readShopTestFulfilment} from '../../server/shop-test-fulfilment.js';

async function setup(product='pos-download'){
 const f=await fixture();const {pool,db}=f;
 await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopPaymentStatus(pool);await migrateShopTestFulfilment(pool);
 const draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{[product]:1}}),line=draft.snapshot.lines[0];
 const order=await prepareShopCheckout(pool,{token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:line.netCents,acceptedGrossCents:line.grossCents});
 if(product==='pos-download')await acceptFixtureDownloadConsent(pool,order.id);
 let command;await dispatchPreparedShopCheckout(pool,{id:order.id,submit:async c=>{command=c;return payment(c);}});
 const fetchPayment=async()=>payment(command,'paid');
 await reconcileShopTestPayment(pool,{id:order.id,fetchPayment});
 return {...f,order,command,fetchPayment,run:(overrides={})=>rehearseShopTestFulfilment(pool,{id:order.id,fetchPayment,...overrides})};
}

test('TEST preview preserves amounts and original buyer; replay stays a preview',async()=>{
 const f=await setup();try{
  await migrateShopTestFulfilment(f.pool);
  await f.db.query("UPDATE company_billing_profiles SET company_name='Changed buyer' WHERE company_id=$1",[f.a]);
  const first=await f.run(),again=await f.run();
  assert.equal(first.replay,false);assert.equal(again.replay,true);
  assert.equal(first.netCents,39900);assert.equal(first.vatCents,7581);assert.equal(first.grossCents,47481);
  assert.equal(first.buyer.company_name,'Fixture Company');assert.equal(first.mode,'test');
  assert.equal(first.invoiceIssued,false);assert.equal(first.canActivate,false);assert.equal(first.canPay,false);
  assert.match(first.label,/keine Rechnung/);assert.equal(first.invoiceNumber,undefined);assert.equal(first.licenseKey,undefined);
  assert.equal((await f.db.query('SELECT 1 FROM shop_test_fulfilments')).rows.length,1);
  assert.equal((await f.db.query('SELECT status FROM shop_license_jobs')).rows[0].status,'pending');
  assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'open');
  for(const table of ['company_entitlements','company_features','billing_transactions'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
 }finally{await f.db.close();}
});

test('TEST preview reader requires current owner/admin session and company',async()=>{
 const f=await setup();try{
  await f.run();const r=await readShopTestFulfilment(f.pool,{token:'owner-a',id:f.order.id});assert.equal(r.checkoutId,f.order.id);
  assert.equal(r.provider_payment_id,undefined);assert.equal(r.session_hash,undefined);
  for(const [token,code]of [['owner-b','CHECKOUT_NOT_FOUND'],['waiter','FORBIDDEN'],['expired','UNAUTHORIZED'],['inactive','UNAUTHORIZED'],['reset','UNAUTHORIZED']])await assert.rejects(readShopTestFulfilment(f.pool,{token,id:f.order.id}),{code});
  await f.db.query("UPDATE users SET role='manager' WHERE company_id=$1",[f.a]);await assert.rejects(readShopTestFulfilment(f.pool,{token:'owner-a',id:f.order.id}),{code:'FORBIDDEN'});
 }finally{await f.db.close();}
});

test('monthly payment cannot imply a subscription or TEST licence',async()=>{
 const f=await setup('pos-online');try{await assert.rejects(f.run(),{code:'FULFILMENT_UNSUPPORTED'});assert.equal((await f.db.query('SELECT 1 FROM shop_test_fulfilments')).rows.length,0);}finally{await f.db.close();}
});

test('fresh proof is mandatory even for a stored TEST preview',async()=>{
 const f=await setup();try{
  await f.run();
  for(const patch of [{mode:'live'},{status:'open'},{id:'tr_foreign'},{amountRefunded:{currency:'EUR',value:'1.00'}},{amountChargedBack:{currency:'EUR',value:'1.00'}},{metadata:{shopOrderId:f.order.id,shopCompanyId:f.b,shopPlanCode:'download_license'}}])await assert.rejects(f.run({fetchPayment:async()=>({...payment(f.command,'paid'),...patch})}),{code:'PROVIDER_MISMATCH'});
  await assert.rejects(f.run({fetchPayment:async()=>{throw Error('private provider error');}}),{code:'PROVIDER_UNCERTAIN'});
  assert.equal((await f.db.query('SELECT 1 FROM shop_test_fulfilments')).rows.length,1);
 }finally{await f.db.close();}
});

test('TEST preview write rolls back and retries after a database failure',async()=>{
 const f=await setup();try{
  const faulty={...f.pool,connect:async()=>{const c=await f.pool.connect();return {...c,query(sql,args){if(sql.startsWith('INSERT INTO shop_test_fulfilments'))throw Error('injected write failure');return c.query(sql,args);}};}};
  await assert.rejects(rehearseShopTestFulfilment(faulty,{id:f.order.id,fetchPayment:f.fetchPayment}),/injected write failure/);
  assert.equal((await f.db.query('SELECT 1 FROM shop_test_fulfilments')).rows.length,0);assert.equal((await f.run()).replay,false);
 }finally{await f.db.close();}
});

test('broken fulfilment links and snapshots fail closed without new records',async t=>{
 const cases=[
  ["UPDATE shop_license_jobs SET company_id=$1",f=>[f.b],'FULFILMENT_MISMATCH'],
  ["UPDATE shop_license_jobs SET status='done'",()=>[],'FULFILMENT_MISMATCH'],
  ["UPDATE shop_license_jobs SET plan_code='pos_base_monthly'",()=>[],'FULFILMENT_MISMATCH'],
  ["UPDATE shop_license_jobs SET provider_payment_id='tr_foreign'",()=>[],'FULFILMENT_MISMATCH'],
  ["DELETE FROM shop_license_jobs",()=>[],'FULFILMENT_MISMATCH'],
  ["UPDATE billing_checkout_guards SET status='resolved'",()=>[],'CHECKOUT_PENDING'],
  ["UPDATE billing_checkout_guards SET slot='other'",()=>[],'CHECKOUT_PENDING'],
  ["UPDATE shop_order_drafts SET status='canceled'",()=>[],'DRAFT_INELIGIBLE'],
  ["UPDATE shop_checkout_orders SET status='open'",()=>[],'CHECKOUT_PENDING'],
  ["UPDATE shop_checkout_orders SET snapshot=jsonb_set(snapshot,'{netCents}','1')",()=>[],'PROVIDER_MISMATCH'],
  ["UPDATE shop_checkout_orders SET billing_snapshot='{}'::jsonb",()=>[],'FULFILMENT_MISMATCH']
  ,["UPDATE shop_order_drafts SET snapshot=jsonb_set(snapshot,'{lines,0,quantity}','2')",()=>[],'FULFILMENT_MISMATCH']
  ,["UPDATE shop_order_drafts SET snapshot=jsonb_set(snapshot,'{lines,0,netCents}','1')",()=>[],'FULFILMENT_MISMATCH']
  ,["UPDATE shop_checkout_orders SET snapshot=jsonb_set(jsonb_set(snapshot,'{netCents}','39899'),'{vatCents}','7582')",()=>[],'PROVIDER_MISMATCH']
 ];
 for(const [sql,args,code]of cases)await t.test(sql,async()=>{const f=await setup();try{await f.db.query(sql,args(f));await assert.rejects(f.run(),{code});assert.equal((await f.db.query('SELECT 1 FROM shop_test_fulfilments')).rows.length,0);}finally{await f.db.close();}});
});

test('stored TEST preview cannot silently change on replay',async()=>{
 const f=await setup();try{await f.run();await f.db.query("UPDATE shop_test_fulfilments SET document=jsonb_set(document,'{netCents}','1')");await assert.rejects(f.run(),{code:'FULFILMENT_MISMATCH'});}finally{await f.db.close();}
});

test('invalid TEST requests are rejected before database access',async()=>{
 const pool={query(){throw Error('unexpected database access');}};
 await assert.rejects(rehearseShopTestFulfilment(pool,{id:'invalid',fetchPayment:async()=>null}),{code:'INVALID_REQUEST'});
 await assert.rejects(rehearseShopTestFulfilment(pool,{id:crypto.randomUUID()}),{code:'INVALID_REQUEST'});
 await assert.rejects(readShopTestFulfilment(pool,{token:'owner-a',id:'invalid'}),{code:'INVALID_REQUEST'});
});

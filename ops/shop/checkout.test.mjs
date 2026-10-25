import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {fixture} from './fixture.mjs';import {migrateShopDrafts,saveShopDraft,cancelShopDraft,readShopDraft} from '../../server/shop-drafts.js';import {migrateShopCheckouts,prepareShopCheckout,readShopCheckout,abandonShopCheckout} from '../../server/shop-checkout-orders.js';import {validCheckout} from '../../apps/web/public/shop/checkout-flow.js';
test('checkout preparation is atomic, recoverable and never calls a provider',async t=>{
 const {pool,db,a,b,online}=await fixture();try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);
 let draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}});let request={token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:2999,acceptedGrossCents:3569},order;
 await t.test('requires explicit exact acceptance',async()=>{await assert.rejects(prepareShopCheckout(pool,{...request,acceptedGrossCents:1}),{code:'PRICE_CHANGED'});assert.equal((await db.query('SELECT 1 FROM billing_checkout_guards')).rows.length,0);});
 await t.test('journal failure rolls reservation back',async()=>{const broken={connect:async()=>{const c=await pool.connect();return {...c,query(s,p){if(s.startsWith('INSERT INTO shop_checkout_orders'))throw Error('injected journal failure');return c.query(s,p);}};}};await assert.rejects(prepareShopCheckout(broken,request),/injected journal failure/);assert.equal((await db.query('SELECT 1 FROM billing_checkout_guards')).rows.length,0);});
 await t.test('one prepared record with immutable snapshot and guard',async()=>{order=await prepareShopCheckout(pool,request);assert.equal(order.status,'prepared');assert.equal(validCheckout(order,draft),true);assert.equal(order.canPay,false);assert.equal((await db.query('SELECT 1 FROM billing_checkout_guards')).rows.length,1);assert.ok(!JSON.stringify(order).includes('guard_id'));});
 await t.test('replay after lost response returns same identity',async()=>{assert.equal((await prepareShopCheckout(pool,request)).id,order.id);assert.equal((await readShopCheckout(pool,{token:'owner-a',draftId:draft.id})).id,order.id);await assert.rejects(prepareShopCheckout(pool,{...request,requestId:crypto.randomUUID()}),{code:'REQUEST_CONFLICT'});});
 await t.test('no cross-account reads or writes',async()=>{await assert.rejects(readShopCheckout(pool,{token:'owner-b',id:order.id}),{code:'CHECKOUT_NOT_FOUND'});await assert.rejects(abandonShopCheckout(pool,{token:'owner-b',id:order.id}),{code:'CHECKOUT_NOT_FOUND'});await assert.rejects(prepareShopCheckout(pool,{...request,token:'owner-b'}),{code:'DRAFT_NOT_FOUND'});});
 await t.test('direct draft cancellation cannot clear reservation',async()=>{await assert.rejects(cancelShopDraft(pool,{token:'owner-a',id:draft.id}),{code:'CHECKOUT_PENDING'});assert.equal((await readShopDraft(pool,{token:'owner-a',id:draft.id})).status,'draft');});
 await t.test('unknown provider state cannot be abandoned',async()=>{await db.query("UPDATE shop_checkout_orders SET status='uncertain' WHERE id=$1",[order.id]);await assert.rejects(abandonShopCheckout(pool,{token:'owner-a',id:order.id}),{code:'CHECKOUT_PENDING'});await db.query("UPDATE shop_checkout_orders SET status='prepared',provider_payment_id='tr_fixture' WHERE id=$1",[order.id]);await assert.rejects(abandonShopCheckout(pool,{token:'owner-a',id:order.id}),{code:'CHECKOUT_PENDING'});await db.query('UPDATE shop_checkout_orders SET provider_payment_id=NULL WHERE id=$1',[order.id]);});
 await t.test('explicit pre-provider abandonment is atomic and idempotent',async()=>{assert.equal((await abandonShopCheckout(pool,{token:'owner-a',id:order.id})).status,'canceled');assert.equal((await abandonShopCheckout(pool,{token:'owner-a',id:order.id})).id,order.id);assert.equal((await readShopDraft(pool,{token:'owner-a',id:draft.id})).status,'canceled');assert.equal((await db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'resolved');assert.equal((await prepareShopCheckout(pool,request)).status,'canceled');});
 await t.test('fresh prices and expired draft are rejected',async()=>{draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}});request={...request,draftId:draft.id,requestId:crypto.randomUUID()};await db.query('UPDATE company_billing_terms SET monthly_net_cents=1999 WHERE company_id=$1',[a]);await assert.rejects(prepareShopCheckout(pool,request),{code:'PRICE_CHANGED'});await db.query('UPDATE company_billing_terms SET monthly_net_cents=2999 WHERE company_id=$1',[a]);await db.query("UPDATE shop_order_drafts SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[draft.id]);await assert.rejects(prepareShopCheckout(pool,request),{code:'DRAFT_INELIGIBLE'});});
 await t.test('tampered response never validates',()=>{assert.equal(validCheckout({...order,snapshot:{...order.snapshot,grossCents:1}},draft),false);assert.equal(validCheckout({...order,canPay:true},draft),false);});
 await t.test('no licences, payments or entitlement activation',async()=>{assert.equal((await db.query('SELECT 1 FROM company_entitlements')).rows.length,0);assert.equal((await db.query('SELECT 1 FROM billing_transactions')).rows.length,0);});
 }finally{await db.close();}
});

test('stored checkout recovery returns canonical fields only and rejects damaged snapshots',async()=>{
 const {pool,db}=await fixture();try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);
  const draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}}),request={token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:2999,acceptedGrossCents:3569},order=await prepareShopCheckout(pool,request);
  await db.query('UPDATE shop_checkout_orders SET snapshot=$2::jsonb WHERE id=$1',[order.id,JSON.stringify({...order.snapshot,privateNote:'private fixture',buyer:{email:'private@example.test'}})]);
  for(const result of [await readShopCheckout(pool,{token:'owner-a',id:order.id}),await prepareShopCheckout(pool,request)]){assert.deepEqual(result.snapshot,order.snapshot);assert.ok(!JSON.stringify(result).includes('private'));}
  for(const patch of [{vatCents:1},{planCode:'download_license'},{period:'once'},{currency:'USD'},{netCents:'2999'}]){
   await db.query('UPDATE shop_checkout_orders SET snapshot=$2::jsonb WHERE id=$1',[order.id,JSON.stringify({...order.snapshot,...patch})]);
   await assert.rejects(readShopCheckout(pool,{token:'owner-a',id:order.id}),{code:'SHOP_UNAVAILABLE'});
   await assert.rejects(readShopCheckout(pool,{token:'owner-a',draftId:draft.id}),{code:'SHOP_UNAVAILABLE'});
   await assert.rejects(prepareShopCheckout(pool,request),e=>['SHOP_UNAVAILABLE','REQUEST_CONFLICT'].includes(e.code));
   await assert.rejects(abandonShopCheckout(pool,{token:'owner-a',id:order.id}),{code:'SHOP_UNAVAILABLE'});
   assert.equal((await db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'creating');
   assert.equal((await db.query('SELECT status FROM shop_order_drafts')).rows[0].status,'draft');
   assert.equal((await db.query('SELECT 1 FROM shop_checkout_orders')).rows.length,1);assert.equal((await db.query('SELECT 1 FROM billing_checkout_guards')).rows.length,1);
  }
 }finally{await db.close();}
});
test('damaged saved drafts cannot reserve a checkout slot',async()=>{
 const {pool,db}=await fixture();try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);
  const draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-online':1}}),request={token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:2999,acceptedGrossCents:3569};
  for(const change of [s=>({...s,lines:[]}),s=>({...s,lines:[...s.lines,...s.lines]}),s=>({...s,lines:[{...s.lines[0],quantity:2}]}),s=>({...s,lines:[{...s.lines[0],vatCents:1}]}),s=>({...s,currency:'USD'})]){
   await db.query('UPDATE shop_order_drafts SET snapshot=$2::jsonb WHERE id=$1',[draft.id,JSON.stringify(change(draft.snapshot))]);
   await assert.rejects(prepareShopCheckout(pool,request),e=>['DRAFT_INELIGIBLE','SHOP_UNAVAILABLE'].includes(e.code));
   assert.equal((await db.query('SELECT 1 FROM billing_checkout_guards')).rows.length,0);assert.equal((await db.query('SELECT 1 FROM shop_checkout_orders')).rows.length,0);
  }
  await db.query('UPDATE shop_order_drafts SET snapshot=$2::jsonb WHERE id=$1',[draft.id,JSON.stringify(draft.snapshot)]);assert.equal((await prepareShopCheckout(pool,request)).status,'prepared');
 }finally{await db.close();}
});

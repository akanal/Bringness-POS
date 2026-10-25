import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';
import {fixture} from './fixture.mjs';import {migrateShopDrafts} from '../../server/shop-drafts.js';import {shopPreview} from '../../server/shop-preview-policy.js';import {migrateShopDraftHistory,readShopDraftHistory} from '../../server/shop-draft-history.js';import {createShopRuntime} from '../../server/shop-http.js';
async function setup(){
 const f=await fixture();await migrateShopDrafts(f.pool);await migrateShopDraftHistory(f.pool);
 const snapshot=shopPreview({cart:{'pos-download':1},plans:[{code:'download_license',amount_cents:39900,billing_type:'one_time',currency:'EUR',active:true}],profile:{company_name:'Fixture',street:'Example 1',postal_code:'10115',city:'Berlin',country:'DE'}});
 for(const [company,count]of [[f.a,25],[f.b,3]])for(let i=0;i<count;i++)await f.db.query(`INSERT INTO shop_order_drafts(id,company_id,request_id,cart_hash,snapshot,status,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'2020-01-01T00:00:00.123000Z'::timestamptz+$7::int*interval '1 microsecond','2020-01-01T00:00:00.123000Z'::timestamptz+$7::int*interval '1 microsecond'+interval '5 minutes')`,[crypto.randomUUID(),company,crypto.randomUUID(),'a'.repeat(64),JSON.stringify(snapshot),i===0?'draft':'canceled',Math.floor(i/2)]);
 return f;
}
test('history pages include every own row across microseconds and exact timestamp ties',async()=>{
 const f=await setup();try{
  await migrateShopDraftHistory(f.pool);const expected=(await f.db.query('SELECT id FROM shop_order_drafts WHERE company_id=$1 ORDER BY created_at DESC,id DESC',[f.a])).rows.map(r=>r.id),ids=[];let cursor=null,pages=0;
  do{const page=await readShopDraftHistory(f.pool,{token:'owner-a',cursor});assert.ok(page.items.length<=10);assert.equal(page.canPay,false);assert.equal(page.canActivate,false);assert.equal(page.checkoutConnected,false);ids.push(...page.items.map(r=>r.id));cursor=page.nextCursor;pages++;if(cursor){const raw=JSON.parse(Buffer.from(cursor,'base64url').toString());assert.match(raw.time,/\.123\d{3}Z$/);assert.equal(raw.scope,page.scope);}assert.ok(!JSON.stringify(page).includes('company_id'));assert.ok(!JSON.stringify(page).includes('cart_hash'));assert.ok(!JSON.stringify(page).includes('request_id'));}while(cursor);
  assert.equal(pages,3);assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,25);assert.equal((await f.db.query('SELECT 1 FROM shop_order_drafts')).rows.length,28);
 }finally{await f.db.close();}
});
test('history authentication and company-bound cursors reject cross-account continuation',async()=>{
 const f=await setup();try{
  const page=await readShopDraftHistory(f.pool,{token:'owner-a'});assert.equal((await readShopDraftHistory(f.pool,{token:'owner-b'})).items.length,3);
  await assert.rejects(readShopDraftHistory(f.pool,{token:'owner-b',cursor:page.nextCursor}),{code:'ACCOUNT_CHANGED'});
  for(const [token,code]of [['waiter','FORBIDDEN'],['expired','UNAUTHORIZED'],['inactive','UNAUTHORIZED'],['reset','UNAUTHORIZED']])await assert.rejects(readShopDraftHistory(f.pool,{token}),{code});
  await f.db.query('UPDATE users SET company_id=$2 WHERE company_id=$1',[f.a,f.b]);await assert.rejects(readShopDraftHistory(f.pool,{token:'owner-a',cursor:page.nextCursor}),{code:'ACCOUNT_CHANGED'});
 }finally{await f.db.close();}
});
test('malformed history cursors and corrupted snapshots fail closed',async()=>{
 const f=await setup();try{
  for(const cursor of ['', '!', 'a'.repeat(513),Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({v:1,id:crypto.randomUUID(),scope:'a'.repeat(64),time:'2026-02-30T12:00:00.123456Z'})).toString('base64url')])await assert.rejects(readShopDraftHistory(f.pool,{token:'owner-a',cursor}),{code:'INVALID_REQUEST'});
  await f.db.query("UPDATE shop_order_drafts SET snapshot=jsonb_set(snapshot,'{lines,0,grossCents}','1') WHERE company_id=$1",[f.a]);await assert.rejects(readShopDraftHistory(f.pool,{token:'owner-a'}),{code:'SHOP_UNAVAILABLE'});
 }finally{await f.db.close();}
});
test('real HTTP history is gated, bounded, no-store and read-only',async()=>{
 const f=await setup(),runtime=createShopRuntime(f.pool,{enabled:true});await runtime.migrate();const disabled=createShopRuntime(f.pool);const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal(await disabled.handle({url:'/api/v1/shop/drafts/history'},{}),false);
  const get=(suffix='',token='owner-a',method='GET')=>fetch(origin+'/api/v1/shop/drafts/history'+suffix,{method,headers:token?{Authorization:'Bearer '+token}:{}});
  const first=await get();assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');const page=await first.json();assert.equal(page.items.length,10);assert.equal((await (await get('?cursor='+page.nextCursor)).json()).items.length,10);
  for(const suffix of ['?unknown=1','?cursor=x&cursor=y','?cursor=','?cursor=broken'])assert.equal((await get(suffix)).status,400);
  assert.equal((await get('',null)).status,401);assert.equal((await get('','waiter')).status,403);assert.equal((await get('','owner-a','POST')).status,405);
  assert.equal((await f.db.query('SELECT 1 FROM billing_checkout_guards')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM company_entitlements')).rows.length,0);
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});

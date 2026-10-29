import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import {fixture} from '../ops/shop/fixture.mjs';
import {migrateMarketplace} from './shop-marketplace.js';
import {migrateMarketplaceConnections,createMarketplaceConnections} from './shop-mollie-marketplace-connection.js';
import {createMarketplaceTestIntegration} from './shop-mollie-marketplace-integration.js';
import {createMarketplaceRuntime} from './shop-marketplace-http.js';
import {createMarketplaceCheckout} from './shop-payment-marketplace-checkout.js';
import {marketplaceInbox,transitionMarketplaceOrder} from './shop-marketplace-orders.js';

async function setup(){
 const f=await fixture();await migrateMarketplace(f.pool);await migrateMarketplaceConnections(f.pool);
 for(const c of [f.a,f.b])await f.db.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved',$2)",[c,{name:'Fixture',street:'Testweg 1',postalCode:'10115',city:'Berlin',country:'DE',email:'test@example.test'}]);
 const calls=[];let refreshes=0,posts=0,current,lose=false,failRefresh=false,badToken=false,onExchange;
 const tokens=()=>({access_token:'access_isolated_fixture_'+refreshes,refresh_token:'refresh_isolated_fixture_'+refreshes,expires_in:3600,token_type:'bearer',scope:'organizations.read profiles.read payments.read payments.write'});
 const fetcher=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET'});const u=new URL(url);assert.equal(u.origin,'https://api.mollie.com');assert.equal(opts.redirect,'error');
  if(u.pathname==='/oauth2/tokens'){
   const p=new URLSearchParams(opts.body);assert.match(opts.headers.Authorization,/^Basic /);
   if(onExchange)await onExchange(p);
   if(p.get('grant_type')==='refresh_token'){refreshes++;if(failRefresh)return Response.json({error:'fixture provider secret must not leak'},{status:400});}
   return Response.json(badToken?{...tokens(),access_token:'live_forbidden'}:tokens());
  }
  assert.match(opts.headers.Authorization,/^Bearer access_isolated_fixture_/);
  if(u.pathname==='/v2/organizations/me')return Response.json({id:'org_fixture'});
  if(u.pathname.startsWith('/v2/profiles/'))return Response.json({id:u.pathname.split('/').at(-1),status:u.pathname.endsWith('unverified')?'unverified':'verified'});
  if(opts.method==='POST'){
   posts++;const body=JSON.parse(opts.body);assert.equal(body.testmode,true);assert.equal(body.webhookUrl,'https://bringness.de/api/v1/shop/marketplace/checkout-notification');
   assert.match(body.redirectUrl,/\/shop\/marketplace-payment-return.html\?marketOrderId=/);
   current={resource:'payment',id:'tr_connectionfixture',mode:'test',profileId:body.profileId,status:'open',sequenceType:'oneoff',amount:body.amount,metadata:body.metadata,_links:{checkout:{href:'https://checkout.mollie.com/test'}}};if(lose)throw Error('lost reply');return Response.json(current);
  }
  if(u.pathname==='/v2/payments')return Response.json({count:current?1:0,_embedded:{payments:current?[current]:[]},_links:{next:null}});
  return Response.json(current);
 };
 const config={clientId:'app_fixture',clientSecret:'fixture_not_a_real_secret',tokenKey:'ab'.repeat(32),publicOrigin:'https://bringness.de',fetcher};
 const integration=createMarketplaceTestIntegration(f.pool,config),service=integration.merchantConnections;
 async function connect(){const start=await service.begin({token:'owner-a'}),state=new URL(start.authorizationUrl).searchParams.get('state');await service.complete({state,code:'fixture_code',browserNonce:start.browserNonce});return service.verify({token:'owner-a',profileId:'pfl_fixture'});}
 async function order(){const id=randomUUID();await f.db.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[id,f.a,randomUUID(),{reference:'Fixture order',grossCents:1190,netCents:1000,vatCents:190,currency:'EUR',lines:[]},{method:'shipping'}]);await f.db.query('INSERT INTO shop_market_orders VALUES($1,$2,$3,$4,$5)',[f.b,randomUUID(),'fixture',id,{}]);return {orderId:id,token:'owner-b',requestId:randomUUID()};}
 return {...f,config,service,integration,connect,order,calls,get refreshes(){return refreshes;},get posts(){return posts;},get current(){return current;},set current(x){current=x;},set lose(x){lose=x;},set failRefresh(x){failRefresh=x;},set badToken(x){badToken=x;},set onExchange(x){onExchange=x;}};
}
test('consent is bound to browser, session and approved seller, single use with encrypted credentials',async()=>{
 const f=await setup();try{
  for(const token of ['waiter','inactive','expired','reset','unknown'])await assert.rejects(f.service.begin({token}),/FORBIDDEN|UNAUTHORIZED/);
  const begin=await f.service.begin({token:'owner-a'}),state=new URL(begin.authorizationUrl).searchParams.get('state');
  assert.equal(new URL(begin.authorizationUrl).origin,'https://my.mollie.com');
  await assert.rejects(f.service.complete({state,code:'fixture',browserNonce:'00'.repeat(32)}),/MARKET_CONNECT_STATE/);assert.equal(f.calls.length,0);
  await f.service.complete({state,code:'fixture',browserNonce:begin.browserNonce});
  await assert.rejects(f.service.complete({state,code:'fixture',browserNonce:begin.browserNonce}),/MARKET_CONNECT_STATE/);
  const row=(await f.db.query('SELECT * FROM shop_market_mollie_connections')).rows[0];assert.equal(row.status,'pending');assert.ok(!JSON.stringify(row).includes('access_isolated'));assert.ok(!JSON.stringify(row).includes('refresh_isolated'));
  const status=await f.service.status({token:'owner-a'});assert.equal(status.paymentsEnabled,false);assert.equal(status.paymentMode,'test');assert.ok(!JSON.stringify(status).includes('envelope'));
  assert.equal((await f.service.status({token:'owner-b'})).status,'not_connected');
  await assert.rejects(f.service.verify({token:'owner-a',profileId:'pfl_unverified'}),/MARKET_PROFILE_NOT_READY/);
  assert.equal((await f.service.verify({token:'owner-a',profileId:'pfl_fixture'})).status,'verified');
  const binding=await f.service.loadConnection(f.a);assert.equal(binding.merchantId,'org_fixture');
  await assert.rejects(f.service.withAccessToken(f.b,binding.connectionId,()=>{}),/MARKET_MERCHANT_NOT_CONNECTED/);
 }finally{await f.db.close();}
});
test('expired, denied, replaced and revoked-session consent never establishes a merchant binding',async()=>{
 const f=await setup();try{
  let b=await f.service.begin({token:'owner-a'}),state=new URL(b.authorizationUrl).searchParams.get('state');
  await assert.rejects(f.service.complete({state,error:'access_denied',browserNonce:b.browserNonce}),/MARKET_CONNECT_DENIED/);assert.equal(f.calls.length,0);
  b=await f.service.begin({token:'owner-a'});state=new URL(b.authorizationUrl).searchParams.get('state');await f.service.begin({token:'owner-a'});
  await assert.rejects(f.service.complete({state,code:'fixture',browserNonce:b.browserNonce}),/MARKET_CONNECT_STATE/);
  b=await f.service.begin({token:'owner-a'});state=new URL(b.authorizationUrl).searchParams.get('state');await f.db.exec("UPDATE shop_market_mollie_states SET expires_at=clock_timestamp()-interval '1 minute'");
  await assert.rejects(f.service.complete({state,code:'fixture',browserNonce:b.browserNonce}),/MARKET_CONNECT_STATE/);
  b=await f.service.begin({token:'owner-a'});state=new URL(b.authorizationUrl).searchParams.get('state');await f.db.query("UPDATE users SET status='inactive' WHERE company_id=$1",[f.a]);
  await assert.rejects(f.service.complete({state,code:'fixture',browserNonce:b.browserNonce}),/UNAUTHORIZED/);assert.equal(f.calls.length,0);
 }finally{await f.db.close();}
});
test('token refresh is durable before use; corruption, wrong key and failed refresh fail closed',async()=>{
 const f=await setup();try{
  await f.connect();const binding=await f.service.loadConnection(f.a);
  await f.db.exec("UPDATE shop_market_mollie_connections SET expires_at=clock_timestamp()-interval '1 second'");
  await f.service.withAccessToken(f.a,binding.connectionId,async token=>{assert.equal(token,'access_isolated_fixture_1');const r=(await f.db.query('SELECT expires_at FROM shop_market_mollie_connections')).rows[0];assert.ok(new Date(r.expires_at).getTime()>Date.now());});assert.equal(f.refreshes,1);
  const otherKey=createMarketplaceConnections(f.pool,{...f.config,tokenKey:'cd'.repeat(32)});await assert.rejects(otherKey.withAccessToken(f.a,binding.connectionId,()=>{}),/MARKET_MERCHANT_NOT_CONNECTED/);
  f.failRefresh=true;await f.db.exec("UPDATE shop_market_mollie_connections SET expires_at=clock_timestamp()-interval '1 second'");let invoked=false;
  await assert.rejects(f.service.withAccessToken(f.a,binding.connectionId,()=>{invoked=true;}),/MARKET_CONNECT_FAILED/);assert.equal(invoked,false);
  const row=(await f.db.query('SELECT * FROM shop_market_mollie_connections')).rows[0];assert.equal(row.status,'verified');assert.ok(row.token_envelope);
  f.failRefresh=false;await f.service.withAccessToken(f.a,binding.connectionId,()=>{invoked=true;});assert.equal(invoked,true);
 }finally{await f.db.close();}
});
test('API-key token fallback and missing protected configuration are rejected',async()=>{
 const f=await setup();try{
  const disabled=createMarketplaceConnections(f.pool,{publicOrigin:'https://bringness.de'});assert.equal((await disabled.status({token:'owner-a'})).configured,false);await assert.rejects(disabled.begin({token:'owner-a'}),/MARKET_CONNECT_DISABLED/);
  f.badToken=true;const b=await f.service.begin({token:'owner-a'});await assert.rejects(f.service.complete({state:new URL(b.authorizationUrl).searchParams.get('state'),code:'fixture',browserNonce:b.browserNonce}),/MARKET_CONNECT_FAILED/);assert.equal((await f.db.query('SELECT * FROM shop_market_mollie_connections')).rows.length,0);
 }finally{await f.db.close();}
});
test('connected adapter, durable lost-response recovery, worker and exactly-once test handoff remain non-fulfilling',async()=>{
 const f=await setup();try{
  await f.connect();const args=await f.order(),checkout=createMarketplaceCheckout(f.pool,{resolveProvider:f.integration.checkoutProviderResolver});
  assert.equal((await checkout.availability(args)).canStartTest,true);f.lose=true;await assert.rejects(checkout.start(args),/MARKET_PAYMENT_UNCERTAIN/);assert.equal(f.posts,1);
  const resumed=createMarketplaceCheckout(f.pool,{resolveProvider:f.integration.checkoutProviderResolver});assert.deepEqual(await resumed.reconcileBatch(),{checked:1,failed:0});assert.equal((await resumed.status(args)).paymentStatus,'open');assert.equal(f.posts,1);
  await assert.rejects(f.service.begin({token:'owner-a'}),/MARKET_CONNECTION_IN_USE/);
  f.current={...f.current,status:'paid'};await resumed.reconcilePayment(f.current.id);await resumed.reconcilePayment(f.current.id);
  const row=(await f.db.query('SELECT * FROM shop_market_test_payment_handoffs')).rows;assert.equal(row.length,1);assert.equal(row[0].seller_company_id,f.a);assert.equal(row[0].payment_mode,'test');assert.equal(row[0].can_fulfil,false);
  const inbox=await marketplaceInbox(f.pool,{token:'owner-a'});assert.equal(inbox.orders[0].testPayment.status,'paid');assert.deepEqual(inbox.orders[0].actions,[]);assert.equal(inbox.orders[0].paymentStatus,'unpaid');
  await assert.rejects(transitionMarketplaceOrder(f.pool,{token:'owner-a',command:{orderId:args.orderId,requestId:randomUUID(),expectedRevision:0,action:'ship'}}),/MARKET_TEST_CHECKOUT_ACTIVE/);
  assert.equal(f.posts,1);
 }finally{await f.db.close();}
});
test('revocation and changed connection revisions cannot refresh or pay an older intent',async()=>{
 const f=await setup();try{
  await f.connect();const args=await f.order(),checkout=createMarketplaceCheckout(f.pool,{resolveProvider:f.integration.checkoutProviderResolver});await checkout.start(args);
  await f.db.query('UPDATE shop_market_mollie_connections SET connection_id=$2 WHERE seller_company_id=$1',[f.a,randomUUID()]);
  await assert.rejects(checkout.refresh(args),/MARKET_MERCHANT_CHANGED/);assert.equal(f.posts,1);
  await f.service.disconnect({token:'owner-a'});assert.equal((await f.db.query('SELECT token_envelope FROM shop_market_mollie_connections')).rows[0].token_envelope,null);
  await assert.rejects(checkout.refresh(args),/MARKET_MERCHANT_NOT_CONNECTED/);
 }finally{await f.db.close();}
});
test('HTTP consent cookie, callback, exact input, cross-site guards and untrusted payment notification',async()=>{
 const f=await setup();let server;try{
  const runtime=createMarketplaceRuntime(f.pool,{enabled:true,...f.integration});await runtime.migrate();server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/shop/marketplace';
  const post=(path,body={},extra={})=>fetch(base+path,{method:'POST',headers:{Origin:'https://bringness.de','Content-Type':'application/json',Authorization:'Bearer owner-a',...extra},body:JSON.stringify(body),redirect:'manual'});
  assert.equal((await post('/merchant-connect',{}, {Origin:'https://evil.test'})).status,403);
  assert.equal((await post('/merchant-connect',{merchantId:'org_injected'})).status,400);
  const begin=await post('/merchant-connect'),cookie=begin.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);const value=await begin.json();assert.equal(value.browserNonce,undefined);const u=new URL(value.authorizationUrl);
  const callback=await fetch(base+'/merchant-callback?'+new URLSearchParams({state:u.searchParams.get('state'),code:'fixture'}),{headers:{cookie:cookie.split(';')[0],'Sec-Fetch-Site':'cross-site'},redirect:'manual'});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/shop/marketplace-seller.html?merchantConnection=connected');
  assert.equal((await post('/merchant-verify',{profileId:'pfl_fixture'})).status,200);
  const args=await f.order();assert.equal((await post('/checkout',{orderId:args.orderId,requestId:args.requestId},{Authorization:'Bearer owner-b'})).status,200);
  f.current={...f.current,status:'paid'};
  const notify=await fetch(base+'/checkout-notification',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'id=tr_connectionfixture'});assert.equal(notify.status,200);
  assert.equal((await f.db.query('SELECT state FROM shop_market_test_checkouts')).rows[0].state,'paid');
  const fake=await fetch(base+'/checkout-notification',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'id=tr_connectionfixture&status=paid'});assert.equal(fake.status,400);assert.equal(f.posts,1);
 }finally{if(server)await new Promise(r=>server.close(r));await f.db.close();}
});

// Hold provider I/O outside any SQL transaction so invalidation order is explicit.
async function heldConsent(f){
 let entered,release;
 const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 f.onExchange=async()=>{entered();await gate;};
 const b=await f.service.begin({token:'owner-a'}),args={state:new URL(b.authorizationUrl).searchParams.get('state'),code:'fixture',browserNonce:b.browserNonce};
 const result=f.service.complete(args).then(value=>({value}),error=>({error}));
 await started;f.onExchange=null;
 return {args,result,release};
}
test('a newer consent attempt invalidates an in-flight callback without consuming the newer state',async()=>{
 const f=await setup();let held;try{
  held=await heldConsent(f);const next=await f.service.begin({token:'owner-a'});
  held.release();assert.match((await held.result).error.message,/MARKET_CONNECT_STATE/);
  assert.equal((await f.db.query('SELECT * FROM shop_market_mollie_connections')).rows.length,0);
  await f.service.complete({state:new URL(next.authorizationUrl).searchParams.get('state'),code:'new',browserNonce:next.browserNonce});
  assert.equal((await f.service.verify({token:'owner-a',profileId:'pfl_fixture'})).status,'verified');
  assert.equal((await f.db.query('SELECT * FROM shop_market_mollie_states')).rows.length,0);
 }finally{held?.release();if(held)await held.result;await f.db.close();}
});
test('disconnect during OAuth exchange cannot be undone by the late callback',async()=>{
 const f=await setup();let held;try{
  await f.connect();const original=await f.service.loadConnection(f.a);held=await heldConsent(f);
  await f.service.disconnect({token:'owner-a'});held.release();assert.match((await held.result).error.message,/MARKET_CONNECT_STATE/);
  const row=(await f.db.query('SELECT * FROM shop_market_mollie_connections')).rows[0];
  assert.equal(row.connection_id,original.connectionId);assert.equal(row.status,'revoked');assert.equal(row.token_envelope,null);
  assert.equal(f.posts,0);
 }finally{held?.release();if(held)await held.result;await f.db.close();}
});
test('an older callback cannot replace a newer completed and verified connection',async()=>{
 const f=await setup();let held;try{
  held=await heldConsent(f);await f.connect();const current=await f.service.loadConnection(f.a);
  held.release();assert.match((await held.result).error.message,/MARKET_CONNECT_STATE/);
  assert.deepEqual(await f.service.loadConnection(f.a),current);assert.equal(current.status,'verified');
 }finally{held?.release();if(held)await held.result;await f.db.close();}
});
test('consumed callback cannot replay during or after provider I/O',async()=>{
 const f=await setup();let held;try{
  held=await heldConsent(f);const before=f.calls.length;
  await assert.rejects(f.service.complete(held.args),/MARKET_CONNECT_STATE/);assert.equal(f.calls.length,before);
  held.release();assert.ok((await held.result).value.connected);
  await assert.rejects(f.service.complete(held.args),/MARKET_CONNECT_STATE/);assert.equal(f.calls.length,before);
 }finally{held?.release();if(held)await held.result;await f.db.close();}
});
for(const invalidation of ['expiry','session','seller'])test('callback rechecks '+invalidation+' after provider exchange',async()=>{
 const f=await setup();let held;try{
  held=await heldConsent(f);
  if(invalidation==='expiry')await f.db.exec("UPDATE shop_market_mollie_states SET expires_at=clock_timestamp()-interval '1 second'");
  if(invalidation==='session')await f.db.query("DELETE FROM sessions WHERE token_hash=$1",[createHash('sha256').update('owner-a').digest('hex')]);
  if(invalidation==='seller')await f.db.query("UPDATE shop_market_sellers SET status='suspended' WHERE company_id=$1",[f.a]);
  held.release();assert.match((await held.result).error.message,/MARKET_CONNECT_STATE|UNAUTHORIZED|SELLER_NOT_APPROVED/);
  assert.equal((await f.db.query('SELECT * FROM shop_market_mollie_connections')).rows.length,0);assert.equal(f.posts,0);
 }finally{held?.release();if(held)await held.result;await f.db.close();}
});
test('migration upgrades existing states idempotently; failed token exchange remains single-use',async()=>{
 const f=await setup();try{
  const legacy=await f.service.begin({token:'owner-a'});
  await f.db.exec('ALTER TABLE shop_market_mollie_states DROP COLUMN consumed_at');
  await migrateMarketplaceConnections(f.pool);await migrateMarketplaceConnections(f.pool);
  await f.service.complete({state:new URL(legacy.authorizationUrl).searchParams.get('state'),code:'legacy',browserNonce:legacy.browserNonce});
  assert.equal((await f.service.status({token:'owner-a'})).status,'pending');
  f.badToken=true;const next=await f.service.begin({token:'owner-a'}),args={state:new URL(next.authorizationUrl).searchParams.get('state'),code:'fixture',browserNonce:next.browserNonce};
  await assert.rejects(f.service.complete(args),/MARKET_CONNECT_FAILED/);const count=f.calls.length;
  await assert.rejects(f.service.complete(args),/MARKET_CONNECT_STATE/);assert.equal(f.calls.length,count);
  assert.equal((await f.db.query('SELECT consumed_at FROM shop_market_mollie_states')).rows.length,1);
 }finally{await f.db.close();}
});

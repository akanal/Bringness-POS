import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {fixture} from '../ops/shop/fixture.mjs';
import {migrateMarketplace} from './shop-marketplace.js';
import {transitionMarketplaceOrder} from './shop-marketplace-orders.js';
import {createMarketplaceCheckout} from './shop-payment-marketplace-checkout.js';
import {createMarketplaceRuntime} from './shop-marketplace-http.js';

async function setup(){
 const f=await fixture();await migrateMarketplace(f.pool);
 const orderId=randomUUID(),sourceId=randomUUID();
 await f.db.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved',$2)",[f.a,{name:'Fixture GmbH',street:'Testweg 1',postalCode:'10115',city:'Berlin',country:'DE',email:'fixture@example.test'}]);
 await f.db.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[orderId,f.a,sourceId,{grossCents:1190,netCents:1000,vatCents:190,currency:'EUR',lines:[]},{method:'shipping'}]);
 await f.db.query('INSERT INTO shop_market_orders VALUES($1,$2,$3,$4,$5)',[f.b,sourceId,'fixture',orderId,{}]);
 let calls=0,current,throwCreate=false;const submitted=[];
 const provider={mode:'test',merchantId:'fixture-merchant',sellerCompanyId:f.a,
  async createPayment(c){calls++;submitted.push(c);current={id:'tr_test1',mode:'test',merchantId:c.merchantId,orderId:c.orderId,amountCents:c.amountCents,currency:'EUR',status:'open',checkoutUrl:'https://checkout.mollie.com/test'};if(throwCreate)throw Error('lost reply');return {...current};},
  async fetchPayment(id){assert.equal(id,current.id);return {...current};},
  async recoverPayment(c){assert.equal(c.idempotencyKey,submitted[0].idempotencyKey);return current?{...current}:null;}};
 const resolveProvider=async seller=>{assert.equal(seller,f.a);return provider;};
 const checkout=createMarketplaceCheckout(f.pool,{resolveProvider});
 const args={token:'owner-b',orderId,requestId:randomUUID()};
 return {...f,orderId,args,checkout,provider,resolveProvider,submitted,get calls(){return calls;},set throwCreate(v){throwCreate=v;},get current(){return current;},set current(v){current=v;}};
}
test('buyer checkout uses stored seller/amount, one intent across request IDs and private public status',async()=>{
 const f=await setup();try{
  const first=await f.checkout.start(f.args);assert.equal(first.paymentStatus,'open');assert.equal(first.amountCents,1190);
  assert.equal(f.submitted[0].sellerCompanyId,f.a);assert.equal(f.submitted[0].mode,'test');
  assert.equal((await f.checkout.start(f.args)).paymentStatus,'open');
  assert.equal((await f.checkout.start({...f.args,requestId:randomUUID()})).paymentStatus,'open');assert.equal(f.calls,1);
  const result=await f.checkout.status(f.args);assert.equal(result.canPay,false);assert.equal(result.canFulfil,false);
  for(const name of ['provider_id','merchantId','buyer_company_id','intent_id','seller_company_id','idempotencyKey'])assert.equal(Object.hasOwn(result,name),false);
  f.current={...f.current,status:'paid'};assert.equal((await f.checkout.refresh(f.args)).paymentStatus,'paid');
  f.current={...f.current,status:'open'};assert.equal((await f.checkout.refresh(f.args)).paymentStatus,'paid');
 }finally{await f.db.close();}
});
test('lost provider reply persists uncertainty; restart recovers by lookup and never creates twice',async()=>{
 const f=await setup();try{
  f.throwCreate=true;await assert.rejects(f.checkout.start(f.args),/MARKET_PAYMENT_UNCERTAIN/);
  assert.equal((await f.checkout.status(f.args)).requiresRecovery,true);
  const restarted=createMarketplaceCheckout(f.pool,{resolveProvider:f.resolveProvider});
  assert.equal((await restarted.start(f.args)).paymentStatus,'uncertain');assert.equal(f.calls,1);
  assert.equal((await restarted.refresh(f.args)).paymentStatus,'open');assert.equal(f.calls,1);
 }finally{await f.db.close();}
});
test('overlapping requests during provider I/O submit only once and timeouts stay recoverable',async()=>{
 const f=await setup();try{
  let started,release;const begun=new Promise(r=>{started=r;}),hold=new Promise(r=>{release=r;});
  const original=f.provider.createPayment;f.provider.createPayment=async c=>{const result=await original(c);started();await hold;return result;};
  const first=f.checkout.start(f.args);await begun;
  assert.equal((await f.checkout.start({...f.args,requestId:randomUUID()})).paymentStatus,'uncertain');assert.equal(f.calls,1);
  release();assert.equal((await first).paymentStatus,'open');
  const events=(await f.db.query('SELECT state FROM shop_market_test_checkout_events ORDER BY id')).rows.map(r=>r.state);
  assert.deepEqual(events,['prepared','uncertain','open']);
  await f.checkout.refresh(f.args);assert.equal((await f.db.query('SELECT count(*)::int AS n FROM shop_market_test_checkout_events')).rows[0].n,3);
  await assert.rejects(f.db.exec('DELETE FROM shop_market_test_checkout_events'),/immutable test checkout event/);
 }finally{await f.db.close();}
 const g=await setup();try{
  const original=g.provider.createPayment;g.provider.createPayment=async c=>{await original(c);return new Promise(()=>{});};
  const bounded=createMarketplaceCheckout(g.pool,{resolveProvider:g.resolveProvider,providerTimeoutMs:20});
  await assert.rejects(bounded.start(g.args),/MARKET_PAYMENT_UNCERTAIN/);assert.equal(g.calls,1);
  assert.equal((await bounded.refresh(g.args)).paymentStatus,'open');assert.equal(g.calls,1);
 }finally{await g.db.close();}
});
test('foreign buyers, staff, reset/expired sessions and malformed commands cannot submit',async()=>{
 const f=await setup();try{
  for(const token of ['owner-a','waiter','expired','inactive','reset','unknown'])await assert.rejects(f.checkout.start({...f.args,token}),/(ORDER_NOT_FOUND|FORBIDDEN|UNAUTHORIZED)/);
  await assert.rejects(f.checkout.start({...f.args,orderId:'bad'}),/INVALID_MARKET_INPUT/);
  await assert.rejects(f.checkout.start({...f.args,requestId:'bad'}),/INVALID_MARKET_INPUT/);assert.equal(f.calls,0);
 }finally{await f.db.close();}
});
test('disabled resolver, live credentials, wrong seller and suspended sellers fail before dispatch',async()=>{
 for(const variant of ['disabled','live','wrong-seller','suspended','canceled-order','bad-amount']){
  const f=await setup();try{
   let checkout=f.checkout;
   if(variant==='disabled')checkout=createMarketplaceCheckout(f.pool);
   if(variant==='live')f.provider.mode='live';
   if(variant==='wrong-seller')f.provider.sellerCompanyId=f.b;
   if(variant==='suspended')await f.db.query("UPDATE shop_market_sellers SET status='suspended' WHERE company_id=$1",[f.a]);
   if(variant==='canceled-order')await f.db.query("INSERT INTO shop_market_order_state(order_id,status,revision) VALUES($1,'cancelled',1)",[f.orderId]);
   if(variant==='bad-amount'){await f.db.exec('ALTER TABLE shop_market_seller_orders DISABLE TRIGGER shop_market_order_immutable');await f.db.query('UPDATE shop_market_seller_orders SET snapshot=$2 WHERE id=$1',[f.orderId,{grossCents:1.5,currency:'EUR'}]);}
   await assert.rejects(checkout.start(f.args),/MARKET_|SELLER_NOT_APPROVED/);assert.equal(f.calls,0);
  }finally{await f.db.close();}
 }
});
test('mismatched provider proof and hostile checkout links leave the intent uncertain',async()=>{
 const f=await setup();try{
  f.throwCreate=true;await assert.rejects(f.checkout.start(f.args));const valid={...f.current};
  for(const change of [{mode:'live'},{merchantId:'other'},{orderId:randomUUID()},{amountCents:1189},{currency:'USD'},{id:'invalid'},{checkoutUrl:'https://evil.test/'},{checkoutUrl:'https://checkout.mollie.com@evil.test/'}]){
   f.current={...valid,...change};await assert.rejects(f.checkout.refresh(f.args),/MARKET_PAYMENT_MISMATCH/);
   assert.equal((await f.checkout.status(f.args)).paymentStatus,'uncertain');
  }
  f.current=valid;await f.checkout.refresh(f.args);f.provider.merchantId='changed';await assert.rejects(f.checkout.refresh(f.args),/MARKET_MERCHANT_CHANGED/);
 }finally{await f.db.close();}
});
test('same request ID cannot pay a different order; payment in flight prevents cancellation and fulfilment',async()=>{
 const f=await setup();try{
  await f.checkout.start(f.args);
  const second=randomUUID();await f.db.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[second,f.a,randomUUID(),{grossCents:500,currency:'EUR'},{method:'shipping'}]);
  await f.db.query('INSERT INTO shop_market_orders VALUES($1,$2,$3,$4,$5)',[f.b,randomUUID(),'other',second,{}]);
  await assert.rejects(f.checkout.start({...f.args,orderId:second}),/REQUEST_CONFLICT/);assert.equal(f.calls,1);
  for(const action of ['accept','cancel','reject'])await assert.rejects(transitionMarketplaceOrder(f.pool,{token:'owner-a',command:{orderId:f.orderId,requestId:randomUUID(),expectedRevision:0,action}}),/MARKET_TEST_CHECKOUT_ACTIVE/);
 }finally{await f.db.close();}
});
test('HTTP checkout requires same origin, exact command and authenticated owner; default stays disabled',async()=>{
 const f=await setup();let server;try{
  let runtime=createMarketplaceRuntime(f.pool,{enabled:true,checkoutProviderResolver:f.resolveProvider});await runtime.migrate();
  server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.statusCode=404;res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1/shop/marketplace';
  const post=(path,body,extra={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://bringness.de',Authorization:'Bearer owner-b',...extra},body:JSON.stringify(body)});
  const body={orderId:f.orderId,requestId:f.args.requestId};
  assert.equal((await post('/checkout',body,{Origin:'https://evil.test'})).status,403);
  assert.equal((await post('/checkout',{...body,amountCents:1})).status,400);
  assert.equal((await post('/checkout',body,{Authorization:''})).status,401);
  assert.equal((await post('/checkout',body)).status,200);
  const status=await fetch(base+'/checkout-status?orderId='+f.orderId,{headers:{Authorization:'Bearer owner-b'}});assert.equal(status.status,200);assert.equal((await status.json()).paymentStatus,'open');
  f.current={...f.current,status:'paid'};assert.equal((await (await post('/checkout-refresh',{orderId:f.orderId})).json()).paymentStatus,'paid');
  runtime=createMarketplaceRuntime(f.pool,{enabled:true});await runtime.migrate();
  assert.equal((await post('/checkout',body)).status,409);
 }finally{if(server)await new Promise(r=>server.close(r));await f.db.close();}
});

test('marketplace service and HTTP recover a lost Mollie adapter reply with one POST and no fulfilment',async()=>{
 const {createMarketplaceMollieTestResolver}=await import('./shop-mollie-marketplace-test-adapter.js');
 const f=await setup();let server;
 try{
  const binding={kind:'mollie-oauth',mode:'test',status:'verified',sellerCompanyId:f.a,connectionId:randomUUID(),merchantId:'org_fixture',profileId:'pfl_fixture'};
  let providerPayment,creates=0,loseReply=true;const requests=[];
  const resolver=createMarketplaceMollieTestResolver({publicOrigin:'https://bringness.de',
   loadConnection:async()=>binding,withAccessToken:async(seller,revision,fn)=>{assert.equal(seller,f.a);assert.equal(revision,binding.connectionId);return fn('access_isolated_test_fixture');},
   fetcher:async(url,options)=>{
    const u=new URL(url);requests.push({url,method:options.method});let value;
    if(u.pathname==='/v2/organizations/me')value={id:binding.merchantId};
    else if(u.pathname==='/v2/profiles/'+binding.profileId)value={id:binding.profileId,status:'verified'};
    else if(options.method==='POST'){
     creates++;const body=JSON.parse(options.body);assert.equal(body.testmode,true);assert.equal(body.amount.value,'11.90');
     providerPayment={resource:'payment',id:'tr_molliefixture',mode:'test',profileId:binding.profileId,status:'open',sequenceType:'oneoff',amount:body.amount,metadata:body.metadata,_links:{checkout:{href:'https://checkout.mollie.com/test'}}};
     if(loseReply)throw Error('lost response');value=providerPayment;
    }else if(u.pathname==='/v2/payments')value={count:1,_embedded:{payments:[providerPayment]},_links:{next:null}};
    else value=providerPayment;
    return Response.json(value);
   }});
  const checkout=createMarketplaceCheckout(f.pool,{resolveProvider:resolver});
  await assert.rejects(checkout.start(f.args),/MARKET_PAYMENT_UNCERTAIN/);assert.equal(creates,1);
  // Recreate the HTTP runtime: no in-memory dispatch or payment state survives.
  const runtime=createMarketplaceRuntime(f.pool,{enabled:true,checkoutProviderResolver:resolver});await runtime.migrate();
  server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.statusCode=404;res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/shop/marketplace';
  const post=async(path,body)=>fetch(base+path,{method:'POST',headers:{Origin:'https://bringness.de','Content-Type':'application/json',Authorization:'Bearer owner-b'},body:JSON.stringify(body)});
  const retry=await post('/checkout',{orderId:f.orderId,requestId:randomUUID()});assert.equal(retry.status,200);assert.equal((await retry.json()).paymentStatus,'uncertain');assert.equal(creates,1);
  loseReply=false;const recovered=await post('/checkout-refresh',{orderId:f.orderId});assert.equal(recovered.status,200);assert.equal((await recovered.json()).paymentStatus,'open');assert.equal(creates,1);
  providerPayment.status='paid';const paid=await (await post('/checkout-refresh',{orderId:f.orderId})).json();assert.equal(paid.paymentStatus,'paid');assert.equal(paid.canPay,false);assert.equal(paid.canFulfil,false);
  await assert.rejects(transitionMarketplaceOrder(f.pool,{token:'owner-a',command:{orderId:f.orderId,requestId:randomUUID(),expectedRevision:0,action:'accept'}}),/MARKET_TEST_CHECKOUT_ACTIVE/);
  assert.ok(requests.every(r=>new URL(r.url).origin==='https://api.mollie.com'));assert.equal(creates,1);
  const events=(await f.db.query('SELECT state FROM shop_market_test_checkout_events ORDER BY id')).rows.map(r=>r.state);assert.deepEqual(events,['prepared','uncertain','open','paid']);
 }finally{if(server)await new Promise(r=>server.close(r));await f.db.close();}
});

test('merchant review is tenant-private, owner-only, lookup-only and throttled',async()=>{
 const f=await setup();try{
  await f.checkout.start(f.args);
  for(const token of ['owner-b','waiter','expired','inactive','reset'])await assert.rejects(f.checkout.merchantRecheck({token,orderId:f.orderId}),/(ORDER_NOT_FOUND|FORBIDDEN|UNAUTHORIZED|SELLER_NOT_APPROVED)/);
  const list=await f.checkout.merchantPayments({token:'owner-a'});assert.equal(list.payments.length,1);assert.equal(list.payments[0].orderId,f.orderId);assert.equal(list.canFulfil,false);
  for(const secret of ['merchantId','provider_id','checkout_url','buyer_company_id','connection_id'])assert.equal(JSON.stringify(list).includes(secret),false);
  f.current={...f.current,status:'paid'};
  const checked=await f.checkout.merchantRecheck({token:'owner-a',orderId:f.orderId});assert.equal(checked.confirmed,true);assert.equal(checked.payments[0].paymentStatus,'paid');assert.equal(f.calls,1);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM shop_market_test_payment_handoffs')).rows[0].n,1);
  await assert.rejects(f.checkout.merchantRecheck({token:'owner-a',orderId:f.orderId}),/MARKET_ORDER_NOT_PAYABLE/);
 }finally{await f.db.close();}
});
test('background failures persist bounded retries and sanitized review state across restarts',async()=>{
 const f=await setup();try{
  await f.checkout.start(f.args);f.provider.fetchPayment=async()=>{throw Error('private_access_token_should_never_escape');};
  for(let i=0;i<8;i++){
   await f.db.exec("UPDATE shop_market_test_checkouts SET reconcile_after=clock_timestamp()-interval '1 second'");
   const restarted=createMarketplaceCheckout(f.pool,{resolveProvider:f.resolveProvider});assert.deepEqual(await restarted.reconcileBatch(),{checked:0,failed:1});
  }
  let r=(await f.checkout.merchantPayments({token:'owner-a'})).payments[0];assert.equal(r.attempts,8);assert.equal(r.reviewRequired,true);assert.equal(r.lastError,'MARKET_PAYMENT_UNCERTAIN');
  await f.db.exec("UPDATE shop_market_test_checkouts SET reconcile_after=clock_timestamp()-interval '1 second'");
  assert.deepEqual(await f.checkout.reconcileBatch(),{checked:0,failed:0});
  f.provider.fetchPayment=async()=>({...f.current});
  assert.equal((await f.checkout.merchantRecheck({token:'owner-a',orderId:f.orderId})).confirmed,true);
  r=(await f.checkout.merchantPayments({token:'owner-a'})).payments[0];assert.equal(r.reviewRequired,false);assert.equal(r.attempts,0);assert.equal(r.lastError,null);assert.equal(f.calls,1);
  await assert.rejects(f.checkout.merchantRecheck({token:'owner-a',orderId:f.orderId}),/MARKET_RECHECK_BUSY/);
 }finally{await f.db.close();}
});
test('provider mismatches stop automatic retries and retain unpaid fulfilment barrier',async()=>{
 const f=await setup();try{
  await f.checkout.start(f.args);f.current={...f.current,amountCents:1};
  assert.deepEqual(await f.checkout.reconcileBatch(),{checked:0,failed:1});
  const r=(await f.checkout.merchantPayments({token:'owner-a'})).payments[0];assert.equal(r.reviewRequired,true);assert.equal(r.lastError,'MARKET_PAYMENT_MISMATCH');
  assert.equal((await f.checkout.status(f.args)).paymentStatus,'open');assert.equal((await f.db.query('SELECT * FROM shop_market_test_payment_handoffs')).rows.length,0);
 }finally{await f.db.close();}
});
test('host preflight reports test boundaries and scheduler starts only after configuration and migration',async()=>{
 const f=await setup();try{
  const disabled=createMarketplaceRuntime(f.pool,{enabled:true});await disabled.migrate();assert.throws(()=>disabled.startReconciliation(),/MARKET_CHECKOUT_DISABLED/);
  const runtime=createMarketplaceRuntime(f.pool,{enabled:true,checkoutProviderResolver:f.resolveProvider});assert.throws(()=>runtime.startReconciliation(),/MARKET_CHECKOUT_DISABLED/);await runtime.migrate();
  assert.equal(runtime.readiness().productionReady,false);const worker=runtime.startReconciliation();assert.equal(runtime.readiness().schedulerRunning,true);assert.throws(()=>runtime.startReconciliation(),/MARKET_SCHEDULER_ACTIVE/);
  assert.deepEqual(await worker.tick(),{ok:true,checked:0,failed:0,busy:false});await worker.stop();assert.equal(runtime.readiness().schedulerRunning,false);
 }finally{await f.db.close();}
});

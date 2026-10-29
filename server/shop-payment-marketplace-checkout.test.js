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

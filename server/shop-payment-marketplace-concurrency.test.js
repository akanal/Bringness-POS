import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {migrateMarketplace} from './shop-marketplace.js';
import {createMarketplaceCheckout} from './shop-payment-marketplace-checkout.js';
import {createMarketplaceMollieTestResolver} from './shop-mollie-marketplace-test-adapter.js';

const connectionString=process.env.MARKET_CHECKOUT_TEST_DATABASE_URL;
test('real PostgreSQL simultaneous checkout attempts and shared request IDs remain single-dispatch', {skip:!connectionString},async()=>{
 const url=new URL(connectionString);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/bringness_checkout_test')throw Error('ISOLATED_CHECKOUT_DATABASE_REQUIRED');
 const schema='checkout_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString,max:10,options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE companies(id uuid PRIMARY KEY);
   CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
   CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz)`);
  await migrateMarketplace(pool);
  const seller=randomUUID(),buyer=randomUUID(),user=randomUUID(),orderId=randomUUID(),second=randomUUID();
  await pool.query('INSERT INTO companies VALUES($1),($2)',[seller,buyer]);
  await pool.query("INSERT INTO users VALUES($1,$2,'owner','active',false)",[user,buyer]);
  await pool.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[user,createHash('sha256').update('buyer-fixture').digest('hex')]);
  await pool.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved','{}')",[seller]);
  for(const id of [orderId,second]){
   const request=randomUUID();
   await pool.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[id,seller,request,{grossCents:1190,currency:'EUR'},{method:'shipping'}]);
   await pool.query('INSERT INTO shop_market_orders VALUES($1,$2,$3,$4,$5)',[buyer,request,'test',id,{}]);
  }
  let calls=0;
  const binding={kind:'mollie-oauth',mode:'test',status:'verified',sellerCompanyId:seller,connectionId:randomUUID(),merchantId:'org_fixture',profileId:'pfl_fixture'};
  const resolver=createMarketplaceMollieTestResolver({publicOrigin:'https://bringness.de',
   loadConnection:async()=>binding,withAccessToken:async(sellerId,revision,fn)=>{assert.equal(sellerId,seller);assert.equal(revision,binding.connectionId);return fn('access_postgres_isolated_fixture');},
   fetcher:async(url,options)=>{
    const path=new URL(url).pathname;let value;
    if(path==='/v2/organizations/me')value={id:binding.merchantId};
    else if(path==='/v2/profiles/'+binding.profileId)value={id:binding.profileId,status:'verified'};
    else{
     assert.equal(options.method,'POST');calls++;const body=JSON.parse(options.body);
     assert.equal(body.testmode,true);assert.equal(body.amount.value,'11.90');
     await new Promise(r=>setTimeout(r,50));
     value={resource:'payment',id:'tr_'+body.metadata.marketOrderId.replaceAll('-',''),mode:'test',profileId:binding.profileId,
      status:'open',sequenceType:'oneoff',amount:body.amount,metadata:body.metadata,_links:{checkout:{href:'https://checkout.mollie.com/test'}}};
    }
    return Response.json(value);
   }});
  const checkout=createMarketplaceCheckout(pool,{resolveProvider:resolver});
  const requests=await Promise.all(Array.from({length:8},()=>checkout.start({token:'buyer-fixture',orderId,requestId:randomUUID()})));
  assert.equal(calls,1);assert.ok(requests.every(r=>['open','uncertain'].includes(r.paymentStatus)));
  const count=await pool.query('SELECT count(*)::int AS n FROM shop_market_test_checkouts');assert.equal(count.rows[0].n,1);
  const shared=randomUUID();
  const competing=await Promise.allSettled([orderId,second].map(id=>checkout.start({token:'buyer-fixture',orderId:id,requestId:shared})));
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(competing.find(r=>r.status==='rejected').reason.code,'REQUEST_CONFLICT');
  assert.ok(calls<=2);
 }finally{
  if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();
 }
});

test('real PostgreSQL encrypted merchant refresh and parallel reconciliation are single-use and test-only',{skip:!connectionString},async()=>{
 const {migrateMarketplaceConnections}=await import('./shop-mollie-marketplace-connection.js');
 const {createMarketplaceTestIntegration}=await import('./shop-mollie-marketplace-integration.js');
 const url=new URL(connectionString);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/bringness_checkout_test')throw Error('ISOLATED_CHECKOUT_DATABASE_REQUIRED');
 const schema='merchant_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString});let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString,max:12,options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz)`);
  await migrateMarketplace(pool);await migrateMarketplaceConnections(pool);
  const seller=randomUUID(),buyer=randomUUID(),orderId=randomUUID();
  for(const [id,token]of [[seller,'merchant-fixture'],[buyer,'buyer-fixture']]){const user=randomUUID();await pool.query('INSERT INTO companies VALUES($1)',[id]);await pool.query("INSERT INTO users VALUES($1,$2,'owner','active',false)",[user,id]);await pool.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[user,createHash('sha256').update(token).digest('hex')]);}
  await pool.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved','{}')",[seller]);
  let refreshes=0,posts=0,payment;
  const integration=createMarketplaceTestIntegration(pool,{publicOrigin:'https://bringness.de',clientId:'app_fixture',clientSecret:'fixture_not_real_secret',tokenKey:'ab'.repeat(32),fetcher:async(url,options)=>{
   const u=new URL(url);if(u.pathname==='/oauth2/tokens'){
    if(new URLSearchParams(options.body).get('grant_type')==='refresh_token'){refreshes++;await new Promise(r=>setTimeout(r,50));}
    return Response.json({access_token:'access_postgres_fixture_'+refreshes,refresh_token:'refresh_postgres_fixture_'+refreshes,expires_in:3600,token_type:'bearer',scope:'organizations.read profiles.read payments.read payments.write'});
   }
   if(u.pathname==='/v2/organizations/me')return Response.json({id:'org_fixture'});
   if(u.pathname==='/v2/profiles/pfl_fixture')return Response.json({id:'pfl_fixture',status:'verified'});
   if(options.method==='POST'){posts++;const body=JSON.parse(options.body);payment={resource:'payment',id:'tr_pgmerchant',mode:'test',profileId:'pfl_fixture',sequenceType:'oneoff',status:'open',amount:body.amount,metadata:body.metadata,_links:{checkout:{href:'https://checkout.mollie.com/test'}}};throw Error('lost reply');}
   if(u.pathname==='/v2/payments')return Response.json({count:1,_embedded:{payments:[payment]},_links:{next:null}});
   return Response.json(payment);
  }});
  const s=integration.merchantConnections,b=await s.begin({token:'merchant-fixture'});await s.complete({state:new URL(b.authorizationUrl).searchParams.get('state'),code:'fixture',browserNonce:b.browserNonce});await s.verify({token:'merchant-fixture',profileId:'pfl_fixture'});
  const binding=await s.loadConnection(seller);await pool.query("UPDATE shop_market_mollie_connections SET expires_at=now()-interval '1 second'");
  await Promise.all(Array.from({length:8},()=>s.withAccessToken(seller,binding.connectionId,async token=>assert.equal(token,'access_postgres_fixture_1'))));assert.equal(refreshes,1);
  await pool.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[orderId,seller,randomUUID(),{grossCents:1190,currency:'EUR'},{method:'shipping'}]);await pool.query('INSERT INTO shop_market_orders VALUES($1,$2,$3,$4,$5)',[buyer,randomUUID(),'fixture',orderId,{}]);
  const c=()=>createMarketplaceCheckout(pool,{resolveProvider:integration.checkoutProviderResolver}),args={token:'buyer-fixture',orderId,requestId:randomUUID()};
  const race=await Promise.allSettled([s.begin({token:'merchant-fixture'}),c().start(args)]);
  assert.equal(race[1].status,'rejected');assert.match(race[1].reason.message,/MARKET_PAYMENT_UNCERTAIN/);assert.equal(posts,1);
  if(race[0].status==='fulfilled'){const attempt=race[0].value;await assert.rejects(s.complete({state:new URL(attempt.authorizationUrl).searchParams.get('state'),code:'fixture',browserNonce:attempt.browserNonce}),/MARKET_CONNECTION_IN_USE/);}
  else assert.match(race[0].reason.message,/MARKET_CONNECTION_IN_USE/);
  assert.equal((await s.loadConnection(seller)).connectionId,binding.connectionId);
  const results=await Promise.all([c().reconcileBatch(),c().reconcileBatch()]);assert.equal(results.reduce((n,r)=>n+r.checked,0),1);
  await pool.query("UPDATE shop_market_test_checkouts SET reconcile_after=clock_timestamp()-interval '1 second'");
  const manual=await Promise.allSettled(Array.from({length:8},()=>c().merchantRecheck({token:'merchant-fixture',orderId})));
  assert.equal(manual.filter(r=>r.status==='fulfilled'&&r.value.confirmed).length,1);
  for(const r of manual.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/MARKET_RECHECK_BUSY/);
  assert.equal(posts,1);
  payment={...payment,status:'paid'};await Promise.all(Array.from({length:8},()=>c().reconcilePayment(payment.id)));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM shop_market_test_payment_handoffs')).rows[0].n,1);
  assert.equal((await c().status(args)).canFulfil,false);assert.equal(posts,1);
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}
});

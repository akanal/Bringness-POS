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

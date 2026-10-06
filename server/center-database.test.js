import {saveGuestSubscription,manageGuestSubscription,dispatchCenterGuestPush} from './center-guest-push.js';
import test from 'node:test';
import {signPreparedTse} from './tse-signing-worker.js';
import {ensureTseSchema} from './tse-core.js';
import {guestCenterCheckout} from './center-guest-checkout.js';
import {createCenterMollieCheckout,reconcileCenterCheckout} from './center-mollie-checkout.js';
import {withMerchantToken,verifyMerchantProfile} from './center-mollie-merchant.js';
import {beginRestaurantMollieConnect,completeRestaurantMollieConnect} from './center-mollie-connect.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {releaseCenterPayment,centerKitchenQueue,advanceCenterKitchen} from './center-payment-release.js';
import {createCenterHandler} from './center-core.js';
const dependency=process.env.CENTER_TEST_PGLITE || '@electric-sql/pglite';
const engine=await import(process.env.CENTER_TEST_DATABASE_URL ? (process.env.CENTER_TEST_PG || 'pg') : dependency);
test('database migration and delegated setup lifecycle',async()=>{
 const db=process.env.CENTER_TEST_DATABASE_URL ? new engine.default.Pool({connectionString:process.env.CENTER_TEST_DATABASE_URL}) : new engine.PGlite();
 if(process.env.CENTER_TEST_DATABASE_URL){db.exec=sql=>db.query(sql);db.close=()=>db.end();}
 try {
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY,name text DEFAULT 'Company'); CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);
 CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);
 CREATE SEQUENCE receipt_number_seq;
 CREATE TABLE receipts(order_id uuid UNIQUE,receipt_number text UNIQUE,fiscal_status text,merchant_snapshot jsonb);
 CREATE TABLE payments(order_id uuid,method text,amount_cents integer);
 CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid,total_cents integer,status text,source text,created_at timestamptz DEFAULT now());
 CREATE TABLE pos_stock_links(restaurant_id uuid,active boolean);
 CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,name text,price_cents integer,tax_rate numeric,active boolean,ai_stock_available boolean DEFAULT true);
 CREATE TABLE product_translations(product_id uuid,language_code text,allergens text);
 CREATE TABLE order_items(order_id uuid,product_id uuid,product_name_snapshot text,unit_price_cents integer,tax_rate_snapshot numeric,quantity numeric);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
 CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
 CREATE TABLE platform_admins(user_id uuid,active boolean);`);
 const source=await readFile(new URL('./center.js',import.meta.url),'utf8');
 const migration=source.match(/await pool.query\(`([\s\S]*?)`\)/)[1];
 await db.exec(migration);await db.exec(migration);
 const company=crypto.randomUUID(),admin=crypto.randomUUID(),owner=crypto.randomUUID(),restaurant=crypto.randomUUID();
 await db.query('INSERT INTO companies(id) VALUES($1)',[company]);
 await db.query("INSERT INTO users(id,company_id,role,status) VALUES($1,$3,'owner','active'),($2,$3,'owner','active')",[admin,owner,company]);
 await db.query('INSERT INTO platform_admins VALUES($1,true)',[admin]);
 for(const [id,key] of [[admin,'admin'],[owner,'owner']])await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[id,crypto.createHash('sha256').update(key).digest('hex')]);
 await db.query('INSERT INTO restaurants VALUES($1,$2,$3)',[restaurant,company,'Restaurant']);
 const handler=createCenterHandler({query:async(sql,args)=>{const q=await db.query(sql,args);return {...q,rowCount:q.rows.length || q.affectedRows || 0};}});
 async function call(path,method,key,payload){const req=Readable.from(payload?[JSON.stringify(payload)]:[]);Object.assign(req,{url:'/api/v1/centers'+path,method,headers:{authorization:'Bearer '+key}});const res={writeHead(status){this.status=status;},end(raw){this.data=JSON.parse(raw);}};await handler(req,res);return res;}
 const created=await call('','POST','admin',{name:'Center'});assert.equal(created.status,201);const c='/'+created.data.center.id;
 assert.equal((await call(c+'/restaurants','PUT','admin',{restaurantId:restaurant,active:true})).status,200);
 assert.equal((await call(c+'/tables','POST','owner',{name:'Before approval'})).status,403);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'approve',userId:owner,restaurantId:restaurant})).status,403);
 assert.equal((await call(c+'/setup','PUT','admin',{action:'approve',userId:owner,restaurantId:restaurant})).status,200);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'complete'})).status,409);
 assert.equal((await call(c+'/tables','POST','owner',{name:'Table 1'})).status,201);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'complete'})).status,200);
 assert.equal((await call(c+'/tables','POST','owner',{name:'After lock'})).status,403);
 assert.equal((await call(c+'/setup','PUT','admin',{action:'approve',userId:owner,restaurantId:restaurant})).status,409);
 assert.equal((await call(c+'/tables','POST','admin',{name:'Admin maintenance'})).status,201);
 assert.equal((await call(c+'/tables','GET','owner')).data.tables.length,2);
 await db.query("UPDATE center_restaurants SET merchant_reference='merchant-1',payment_status='verified',contract_status='signed'");
 const order=crypto.randomUUID();
 await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[order,restaurant]);
 await db.query("INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency) VALUES('pay-1',$1,$2,$3,'merchant-1',1250,'EUR')",[order,created.data.center.id,restaurant]);
 const pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}}),query:(...args)=>db.query(...args)};
 const payment={paymentId:'pay-1',orderId:order,merchantReference:'merchant-1',amountCents:1250,currency:'EUR',status:'paid',refundedCents:0,chargedBackCents:0,paidAt:new Date().toISOString()};
 assert.equal((await releaseCenterPayment(pool,'pay-1',async()=>({...payment,amountCents:1}))).released,false);
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[order])).rows[0].status,'payment_pending');
 await assert.rejects(releaseCenterPayment(pool,'pay-1',async()=>{throw Error('provider unavailable')}),/provider unavailable/);
 assert.equal((await releaseCenterPayment(pool,'pay-1',async()=>payment)).released,true);
 assert.equal((await releaseCenterPayment(pool,'pay-1',async()=>{throw Error('must not reverify')})).alreadyReleased,true);
 assert.equal((await centerKitchenQueue(pool,restaurant)).length,1);
 assert.equal((await centerKitchenQueue(pool,crypto.randomUUID())).length,0);
 const later=crypto.randomUUID();
 await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[later,restaurant]);
 await db.query("INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency) VALUES('pay-2',$1,$2,$3,'merchant-1',1250,'EUR')",[later,created.data.center.id,restaurant]);
 assert.equal((await releaseCenterPayment(pool,'pay-2',async()=>({...payment,paymentId:'pay-2',orderId:later,paidAt:new Date(Date.parse(payment.paidAt)+1000).toISOString()}))).released,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,later,'preparing')).reason,'earlier_order_waiting');
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'ready')).ok,false);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'preparing')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'preparing')).alreadyApplied,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,later,'preparing')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,later,'ready')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'ready')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'ready')).alreadyApplied,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'preparing')).ok,false);
 const env={CENTER_MOLLIE_CLIENT_ID:'app_test',CENTER_MOLLIE_CLIENT_SECRET:'test-secret',CENTER_MOLLIE_REDIRECT_URI:'https://example.test/api/v1/centers/mollie/callback',CENTER_MOLLIE_TOKEN_KEY:'b'.repeat(64)};
 const begun=await beginRestaurantMollieConnect(pool,{id:owner,company_id:company},created.data.center.id,restaurant,env);assert.equal(begun.status,200);
 const params={state:new URL(begun.authorizationUrl).searchParams.get('state'),code:'test-code'};
 const provider=async()=>({ok:true,json:async()=>({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600})});
 assert.equal((await completeRestaurantMollieConnect(pool,params,begun.browserNonce,env,provider)).connected,true);
 assert.equal((await completeRestaurantMollieConnect(pool,params,begun.browserNonce,env,provider)).status,400);
 assert.equal((await db.query('SELECT payment_status FROM center_restaurants')).rows[0].payment_status,'pending');
 assert.equal((await db.query('SELECT token_envelope FROM center_mollie_credentials')).rows[0].token_envelope.includes('test-access'),false);
 await db.query("UPDATE center_mollie_credentials SET expires_at=now()-interval '1 minute'");
 let refreshes=0;
 const refreshed=await withMerchantToken(pool,restaurant,async token=>token,env,async(url,options)=>{refreshes++;assert.equal(options.body.get('grant_type'),'refresh_token');return {ok:true,json:async()=>({access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:3600})};});
 assert.equal(refreshed,'renewed-access');assert.equal(refreshes,1);
 assert.equal(await withMerchantToken(pool,restaurant,async token=>token,env,()=>{throw Error('no extra refresh')}),'renewed-access');
 const merchantApi=async url=>({ok:true,json:async()=>url.endsWith('/organizations/me')?{id:'org_restaurant'}:url.endsWith('/onboarding/me')?{canReceivePayments:true,canReceiveSettlements:true}:{id:'pfl_restaurant',status:'verified'}});
 assert.equal((await verifyMerchantProfile(pool,restaurant,'pfl_restaurant',env,merchantApi)).ready,true);
 assert.equal((await db.query('SELECT payment_status FROM center_restaurants')).rows[0].payment_status,'verified');
 const checkoutOrder=crypto.randomUUID();await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[checkoutOrder,restaurant]);
 const attempt=(await db.query('INSERT INTO center_checkout_attempts(order_id,center_id,restaurant_id) VALUES($1,$2,$3) RETURNING id',[checkoutOrder,created.data.center.id,restaurant])).rows[0];
 let creates=0;
 const checkout=await createCenterMollieCheckout(pool,attempt.id,{...env,CENTER_PAYMENT_ORIGIN:'https://example.test'},async(url,options)=>{creates++;const payload=JSON.parse(options.body);assert.equal(payload.amount.value,'12.50');assert.equal(payload.profileId,'pfl_restaurant');assert.equal(payload.metadata.bringnessOrderId,checkoutOrder);return {ok:true,json:async()=>({id:'tr_checkout',profileId:payload.profileId,amount:payload.amount,metadata:payload.metadata,_links:{checkout:{href:'https://www.mollie.com/checkout/test'}}})};});
 assert.equal(checkout.checkoutUrl,'https://www.mollie.com/checkout/test');
 assert.equal((await createCenterMollieCheckout(pool,attempt.id,{...env,CENTER_PAYMENT_ORIGIN:'https://example.test'},()=>{throw Error('no duplicate')})).alreadyCreated,true);assert.equal(creates,1);
 assert.equal((await db.query("SELECT payment_id FROM center_order_payments WHERE order_id=$1",[checkoutOrder])).rows[0].payment_id,'tr_checkout');
 const lostOrder=crypto.randomUUID();await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[lostOrder,restaurant]);
 const lost=(await db.query('INSERT INTO center_checkout_attempts(order_id,center_id,restaurant_id) VALUES($1,$2,$3) RETURNING id',[lostOrder,created.data.center.id,restaurant])).rows[0];let externalPayment;
 await assert.rejects(createCenterMollieCheckout(pool,lost.id,{...env,CENTER_PAYMENT_ORIGIN:'https://example.test'},async(url,options)=>{const payload=JSON.parse(options.body);externalPayment={id:'tr_lost',profileId:payload.profileId,amount:payload.amount,metadata:payload.metadata,_links:{checkout:{href:'https://www.mollie.com/checkout/lost'}}};throw Error('lost response');}),/lost response/);
 const recovered=await reconcileCenterCheckout(pool,lost.id,{...env,CENTER_PAYMENT_ORIGIN:'https://example.test'},async()=>({ok:true,json:async()=>({_embedded:{payments:[externalPayment]},_links:{next:null}})}));
 assert.equal(recovered.reconciled,true);assert.equal(recovered.paymentId,'tr_lost');
 assert.equal((await reconcileCenterCheckout(pool,lost.id,{...env,CENTER_PAYMENT_ORIGIN:'https://example.test'},()=>{throw Error('no re-read')})).reconciled,true);
 const table=(await db.query('SELECT qr_token FROM center_tables ORDER BY name LIMIT 1')).rows[0];
 const product=crypto.randomUUID();await db.query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate,active) VALUES($1,$2,'Gericht',1250,19,true)",[product,restaurant]);
 const guestRequest={code:table.qr_token,restaurantId:restaurant,requestId:crypto.randomUUID(),items:[{productId:product,quantity:2,price_cents:1}]};let guestCreates=0;
 const guestProvider=async(url,options)=>{guestCreates++;const payload=JSON.parse(options.body);assert.equal(payload.amount.value,'25.00');return {ok:true,json:async()=>({id:'tr_guest',profileId:payload.profileId,amount:payload.amount,metadata:payload.metadata,_links:{checkout:{href:'https://www.mollie.com/checkout/guest'}}})};};
 const guestEnv={...env,CENTER_PAYMENT_ORIGIN:'https://example.test',CENTER_CHECKOUT_ENABLED:'true'};
 const guestResult=await guestCenterCheckout(pool,guestRequest,guestEnv,guestProvider);assert.equal(guestResult.checkoutUrl,'https://www.mollie.com/checkout/guest');
 assert.equal((await guestCenterCheckout(pool,guestRequest,guestEnv,()=>{throw Error('no duplicate payment')})).orderId,guestResult.orderId);assert.equal(guestCreates,1);
 await assert.rejects(guestCenterCheckout(pool,{...guestRequest,items:[{productId:product,quantity:3}]},guestEnv,guestProvider),/REQUEST_REUSED_WITH_DIFFERENT_CART/);
 assert.equal((await db.query('SELECT total_cents,status FROM orders WHERE id=$1',[guestResult.orderId])).rows[0].total_cents,2500);
 assert.equal((await db.query('SELECT total_cents,status FROM orders WHERE id=$1',[guestResult.orderId])).rows[0].status,'payment_pending');
 const verifiedGuestPayment={paymentId:'tr_guest',orderId:guestResult.orderId,merchantReference:'org_restaurant',amountCents:2500,currency:'EUR',status:'paid',refundedCents:0,chargedBackCents:0,paidAt:new Date().toISOString()};
 assert.equal((await releaseCenterPayment(pool,'tr_guest',async()=>verifiedGuestPayment)).released,true);
 assert.equal((await releaseCenterPayment(pool,'tr_guest',async()=>{throw Error('no duplicate release')})).alreadyReleased,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,guestResult.orderId,'preparing')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,guestResult.orderId,'ready')).ok,true);
 const guestToken=(await db.query('SELECT guest_status_token FROM center_order_payments WHERE order_id=$1',[guestResult.orderId])).rows[0].guest_status_token;
 const statusReq=Readable.from([]);Object.assign(statusReq,{url:'/api/v1/guest/center/status?token='+guestToken,method:'GET',headers:{}});
 const statusRes={writeHead(status){this.status=status;},end(raw){this.data=JSON.parse(raw);}};await handler(statusReq,statusRes);
 assert.equal(statusRes.status,200);assert.equal(statusRes.data.order.status,'ready');assert.equal(statusRes.data.order.restaurant_name,'Restaurant');
 const guestReceipt=(await db.query('SELECT * FROM receipts WHERE order_id=$1',[guestResult.orderId])).rows[0];
 assert.match(guestReceipt.receipt_number,/^BN-\d{4}-\d{6}$/);assert.equal(guestReceipt.fiscal_status,'pending');assert.equal(guestReceipt.merchant_snapshot.restaurantName,'Restaurant');
 assert.equal((await db.query('SELECT count(*)::int n FROM payments WHERE order_id=$1',[guestResult.orderId])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM receipts WHERE order_id=$1',[guestResult.orderId])).rows[0].n,1);

 // Verify durable guest push with real SQL and a simulated push transport.
 const pushSubscription={endpoint:'https://fcm.googleapis.com/fcm/send/center-integration',
  keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
 assert.equal(statusRes.data.order.collection_number,guestReceipt.receipt_number);
 assert.equal((await db.query('SELECT count(*)::int n FROM center_guest_notifications WHERE order_id=$1',[guestResult.orderId])).rows[0].n,1);
 await advanceCenterKitchen(pool,restaurant,guestResult.orderId,'ready');
 assert.equal((await db.query('SELECT count(*)::int n FROM center_guest_notifications WHERE order_id=$1',[guestResult.orderId])).rows[0].n,1);
 assert.equal(await saveGuestSubscription(pool,'f'.repeat(64),pushSubscription,true),false);
 assert.equal(await saveGuestSubscription(pool,guestToken,pushSubscription,true),true);
 assert.equal(await saveGuestSubscription(pool,guestToken,pushSubscription,true),true);
 assert.equal((await db.query('SELECT count(*)::int n FROM center_guest_push WHERE order_id=$1',[guestResult.orderId])).rows[0].n,1);
 assert.equal((await manageGuestSubscription(pool,guestToken,pushSubscription,'status')).subscribed,true);
 await manageGuestSubscription(pool,guestToken,pushSubscription,'disable');
 assert.equal(await dispatchCenterGuestPush(pool,async()=>{throw Error('revoked subscription must not send');}),0);
 assert.equal(await saveGuestSubscription(pool,guestToken,pushSubscription,true),true);
 let sendCalls=0;
 assert.equal(await dispatchCenterGuestPush(pool,async()=>{sendCalls++;throw Object.assign(Error('temporary push outage'),{statusCode:503});}),1);
 assert.equal((await db.query('SELECT state FROM center_guest_notifications WHERE order_id=$1',[guestResult.orderId])).rows[0].state,'pending');

 // A provider-expired endpoint is removed and a new guest enrollment rearms it.
 assert.equal(await dispatchCenterGuestPush(pool,async()=>{throw Object.assign(Error('expired push endpoint'),{statusCode:410});}),1);
 assert.equal((await db.query('SELECT state FROM center_guest_notifications WHERE order_id=$1',[guestResult.orderId])).rows[0].state,'failed');
 assert.equal((await db.query('SELECT count(*)::int n FROM center_guest_push WHERE order_id=$1',[guestResult.orderId])).rows[0].n,0);
 assert.equal(await saveGuestSubscription(pool,guestToken,pushSubscription,true),true);
 const rearmed=(await db.query('SELECT state,attempts FROM center_guest_notifications WHERE order_id=$1',[guestResult.orderId])).rows[0];
 assert.equal(rearmed.state,'pending');assert.equal(rearmed.attempts,0);
 let delivered;
 assert.equal(await dispatchCenterGuestPush(pool,async(subscription,payload)=>{sendCalls++;assert.equal(subscription.endpoint,pushSubscription.endpoint);delivered=JSON.parse(payload);}),1);
 assert.equal(sendCalls,2);assert.match(delivered.body,new RegExp(guestReceipt.receipt_number));assert.match(delivered.title,/Restaurant/);
 assert.equal((await db.query('SELECT state FROM center_guest_notifications WHERE order_id=$1',[guestResult.orderId])).rows[0].state,'sent');
 assert.equal(await saveGuestSubscription(pool,guestToken,pushSubscription,true),true);
 assert.equal(await dispatchCenterGuestPush(pool,async()=>{throw Error('already sent must not repeat');}),0);
 await db.query("UPDATE orders SET created_at=now()-interval '25 hours' WHERE id=$1",[guestResult.orderId]);
 await dispatchCenterGuestPush(pool,async()=>{throw Error('expired order must not send');});
 assert.equal((await db.query('SELECT count(*)::int n FROM center_guest_push WHERE order_id=$1',[guestResult.orderId])).rows[0].n,0);
 assert.equal(await saveGuestSubscription(pool,guestToken,pushSubscription,true),false);

 const failedReceiptOrder=crypto.randomUUID();await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[failedReceiptOrder,restaurant]);
 await db.query("INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency) VALUES('tr_receiptfail',$1,$2,$3,'org_restaurant',1250,'EUR')",[failedReceiptOrder,created.data.center.id,restaurant]);
 await db.query('ALTER TABLE receipts RENAME TO receipts_unavailable');
 await assert.rejects(releaseCenterPayment(pool,'tr_receiptfail',async()=>({...verifiedGuestPayment,paymentId:'tr_receiptfail',orderId:failedReceiptOrder,amountCents:1250})));
 await db.query('ALTER TABLE receipts_unavailable RENAME TO receipts');
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[failedReceiptOrder])).rows[0].status,'payment_pending');
 assert.equal((await db.query('SELECT count(*)::int n FROM payments WHERE order_id=$1',[failedReceiptOrder])).rows[0].n,0);
 // Run the existing production TSE trigger against a center payment.
 await db.exec(`ALTER TABLE receipts ADD COLUMN id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid();
 ALTER TABLE orders ADD COLUMN closed_at timestamptz;
 ALTER TABLE order_items ADD COLUMN id uuid DEFAULT gen_random_uuid();
 ALTER TABLE payments ADD COLUMN id uuid DEFAULT gen_random_uuid();
 ALTER TABLE payments ADD COLUMN created_at timestamptz DEFAULT now();`);
 await ensureTseSchema({query:sql=>db.exec(sql)});
 const tseSource=await readFile(new URL('./tse-integration.js',import.meta.url),'utf8');
 const trigger=tseSource.match(/await pool.query\(`([\s\S]*?)`\)/)[1];await db.exec(trigger);
 const fiscalOrder=crypto.randomUUID();await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[fiscalOrder,restaurant]);
 await db.query("INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,'Gericht',1250,19,1)",[fiscalOrder,product]);
 await db.query("INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency) VALUES('tr_fiscal',$1,$2,$3,'org_restaurant',1250,'EUR')",[fiscalOrder,created.data.center.id,restaurant]);
 assert.equal((await releaseCenterPayment(pool,'tr_fiscal',async()=>({...verifiedGuestPayment,paymentId:'tr_fiscal',orderId:fiscalOrder,amountCents:1250}))).released,true);
 const fiscal=(await db.query('SELECT state,process_data FROM tse_transactions WHERE order_id=$1',[fiscalOrder])).rows[0];assert.equal(fiscal.state,'prepared');assert.equal(fiscal.process_data.totalsMatch,true);assert.equal(fiscal.process_data.payments[0].method,'mollie_center');assert.equal(fiscal.process_data.totalCents,1250);
 assert.equal((await db.query('SELECT fiscal_status FROM receipts WHERE order_id=$1',[fiscalOrder])).rows[0].fiscal_status,'prepared');
 const txId=(await db.query('SELECT id FROM tse_transactions WHERE order_id=$1',[fiscalOrder])).rows[0].id;
 assert.equal((await signPreparedTse(pool,txId,{status:async()=>({certified:false})})).reason,'device_not_ready');
 await db.query("INSERT INTO tse_devices(restaurant_id,serial_number,certified,status) VALUES($1,'SIMULATED-TEST-DEVICE',true,'connected')",[restaurant]);
 let starts=0,finishes=0;
 const fakeTse={status:async()=>({certified:true,serialNumber:'SIMULATED-TEST-DEVICE'}),startTransaction:async()=>{starts++;return {transactionNumber:'1',certified:true,serialNumber:'SIMULATED-TEST-DEVICE',startedAt:new Date().toISOString()};},finishTransaction:async()=>{finishes++;return {transactionNumber:'1',certified:true,serialNumber:'SIMULATED-TEST-DEVICE',signature:'SIMULATED-NOT-A-REAL-SIGNATURE',signatureCounter:'1',signatureAlgorithm:'TEST-ONLY',finishedAt:new Date().toISOString()};}};
 assert.equal((await signPreparedTse(pool,txId,fakeTse)).signed,true);
 assert.equal((await signPreparedTse(pool,txId,fakeTse)).reason,'already_claimed');assert.equal(starts,1);assert.equal(finishes,1);
 assert.equal((await db.query('SELECT fiscal_status FROM receipts WHERE order_id=$1',[fiscalOrder])).rows[0].fiscal_status,'signed');
 const uncertain=(await db.query("INSERT INTO tse_transactions(restaurant_id,client_transaction_id,process_data) VALUES($1,'uncertain-test',$2::jsonb) RETURNING id",[restaurant,JSON.stringify(fiscal.process_data)])).rows[0].id;
 assert.equal((await signPreparedTse(pool,uncertain,{...fakeTse,startTransaction:async()=>{throw Error('lost hardware reply')}})).reason,'outcome_unconfirmed');
 assert.equal((await db.query('SELECT state FROM tse_transactions WHERE id=$1',[uncertain])).rows[0].state,'needs_review');
 assert.equal((await signPreparedTse(pool,uncertain,fakeTse)).reason,'already_claimed');












 }finally{await db.close();}
});

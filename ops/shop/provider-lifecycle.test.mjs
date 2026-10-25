import {acceptFixtureDownloadConsent} from './accept-download-consent-fixture.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';
import {fixture} from './fixture.mjs';import {createShopRuntime} from '../../server/shop-http.js';import {saveShopDraft} from '../../server/shop-drafts.js';import {prepareShopCheckout} from '../../server/shop-checkout-orders.js';import {dispatchPreparedShopCheckout} from '../../server/shop-checkout-dispatch.js';import {createShopMollieTestAdapter} from '../../server/shop-mollie-test-adapter.js';import {migrateShopPaymentStatus,reconcileShopTestPayment} from '../../server/shop-payment-status.js';
import {migrateShopTestFulfilment,rehearseShopTestFulfilment,readShopTestFulfilment} from '../../server/shop-test-fulfilment.js';
test('full internal journal→TEST adapter→fetched proof→licence intent with simulated transport only',async()=>{
 const {pool,db}=await fixture(),runtime=createShopRuntime(pool,{enabled:true});let posts=0,gets=0,proof;try{
 await runtime.migrate();await migrateShopPaymentStatus(pool);const draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}}),l=draft.snapshot.lines[0];const order=await prepareShopCheckout(pool,{token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents});
 await acceptFixtureDownloadConsent(pool,order.id);
 const adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:async(url,options)=>{
  assert.ok(url.startsWith('https://api.mollie.com/v2/payments'));if(options.method==='GET'){gets++;return Response.json({...proof,status:'paid'});}posts++;const body=JSON.parse(options.body);assert.equal(options.headers['Idempotency-Key'],order.id+':payment');proof={...body,id:'tr_endtoend',resource:'payment',mode:'test',status:'open',_links:{checkout:{href:'https://checkout.mollie.com/fixture'}}};return Response.json(proof);
 }});
 assert.equal((await dispatchPreparedShopCheckout(pool,{id:order.id,submit:adapter.submit})).status,'open');assert.equal(posts,1);
 for(let n=0;n<2;n++)assert.equal((await reconcileShopTestPayment(pool,{id:order.id,fetchPayment:adapter.fetchPayment})).status,'paid');assert.equal(posts,1);assert.equal(gets,2);assert.equal((await db.query('SELECT plan_code,status FROM shop_license_jobs')).rows[0].plan_code,'download_license');assert.equal((await db.query('SELECT 1 FROM company_entitlements')).rows.length,0);
 await migrateShopTestFulfilment(pool);
 assert.equal((await rehearseShopTestFulfilment(pool,{id:order.id,fetchPayment:adapter.fetchPayment})).replay,false);
 assert.equal((await rehearseShopTestFulfilment(pool,{id:order.id,fetchPayment:adapter.fetchPayment})).replay,true);
 const preview=await readShopTestFulfilment(pool,{token:'owner-a',id:order.id});assert.equal(preview.grossCents,l.grossCents);assert.equal(preview.invoiceIssued,false);assert.equal(posts,1);assert.equal(gets,4);
 assert.equal((await db.query('SELECT 1 FROM company_entitlements')).rows.length,0);assert.equal((await db.query('SELECT 1 FROM billing_transactions')).rows.length,0);
 // Existing HTTP runtime has no dispatch/reconciliation/fulfilment endpoint, even enabled.
 const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{for(const path of[`checkouts/${order.id}/dispatch`,`checkouts/${order.id}/reconcile`,`checkouts/${order.id}/fulfil`,`test-fulfilments/${order.id}`,`payments/webhook`]){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/shop/${path}`,{method:'POST',headers:{Authorization:'Bearer owner-a','Content-Type':'application/json'},body:'{}'});assert.ok([404,405].includes(response.status));}assert.equal(posts,1);}finally{await new Promise(r=>server.close(r));}
 }finally{await db.close();}
});

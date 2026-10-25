import {Readable} from 'node:stream';
import {acceptFixtureDownloadConsent} from './accept-download-consent-fixture.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';
import {fixture} from './fixture.mjs';import {payment,command,gateway} from './provider-fixture.mjs';
import {migrateShopDrafts,saveShopDraft} from '../../server/shop-drafts.js';import {migrateShopCheckouts,prepareShopCheckout} from '../../server/shop-checkout-orders.js';import {dispatchPreparedShopCheckout,attachVerifiedShopPayment} from '../../server/shop-checkout-dispatch.js';import {migrateShopPaymentStatus} from '../../server/shop-payment-status.js';
import {createShopTestWebhook,shopTestWebhookPath} from '../../server/shop-test-webhook.js';import {enqueueShopTestPayment} from '../../server/shop-test-payment-queue.js';import {processShopTestPayment} from '../../server/shop-test-payment-worker.js';import {createShopMollieTestAdapter} from '../../server/shop-mollie-test-adapter.js';
import {migrateShopTestFulfilment,rehearseShopTestFulfilment} from '../../server/shop-test-fulfilment.js';
async function setup({dispatch=true}={}){
 const f=await fixture();await migrateShopDrafts(f.pool);await migrateShopCheckouts(f.pool);await migrateShopPaymentStatus(f.pool);
 const draft=await saveShopDraft(f.pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}}),line=draft.snapshot.lines[0],order=await prepareShopCheckout(f.pool,{token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:line.netCents,acceptedGrossCents:line.grossCents});let cmd,posts=0;
 await acceptFixtureDownloadConsent(f.pool,order.id);
 const submit=async c=>{posts++;cmd=c;return payment(c);};if(dispatch)await dispatchPreparedShopCheckout(f.pool,{id:order.id,submit});
 return {...f,order,submit,posts:()=>posts,proof:()=>payment(cmd,'paid'),queue:async()=>(await f.db.query('SELECT * FROM shop_test_payment_queue WHERE checkout_id=$1',[order.id])).rows[0]};
}
test('verified TEST attachment atomically queues an initial lookup; failed queue write is recoverable',async()=>{
 const f=await setup({dispatch:false});try{
  let proof;const faulty={...f.pool,connect:async()=>{const c=await f.pool.connect();return {...c,query(sql,args){if(sql.startsWith('INSERT INTO shop_test_payment_queue'))throw Error('injected queue failure');return c.query(sql,args);}};}};
  await assert.rejects(dispatchPreparedShopCheckout(faulty,{id:f.order.id,submit:async c=>proof=await f.submit(c)}),/injected queue/);assert.equal(f.posts(),1);assert.equal(await f.queue(),undefined);assert.equal((await f.db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'uncertain');
  await attachVerifiedShopPayment(f.pool,{id:f.order.id,payment:proof});assert.equal((await f.queue()).state,'pending');assert.equal((await f.db.query('SELECT provider_mode FROM shop_checkout_orders')).rows[0].provider_mode,'test');assert.equal(f.posts(),1);
 }finally{await f.db.close();}
});
test('HTTP callback persists only known TEST IDs, ignores forged proof and does not fetch or activate',async()=>{
 const f=await setup(),receiver=createShopTestWebhook(f.pool,{enabled:true}),server=http.createServer(async(req,res)=>{if(!await receiver.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal(await createShopTestWebhook(f.pool).handle({url:shopTestWebhookPath},{}),false);
  const post=(body,contentType='application/x-www-form-urlencoded',suffix='')=>fetch(origin+shopTestWebhookPath+suffix,{method:'POST',headers:{'content-type':contentType},body});
  const known=await post('id='+f.proof().id),unknown=await post('id=tr_unknown');assert.equal(known.status,200);assert.deepEqual(await known.json(),await unknown.json());assert.equal(known.headers.get('cache-control'),'no-store');
  for(const body of ['id=x','id=tr_x&id=tr_y','id=tr_x&status=paid','id=tr_x&company=foreign'])assert.equal((await post(body)).status,400);
  assert.equal((await post('id='+('a'.repeat(1100)))).status,413);
  assert.equal((await post('{"id":"tr_x","status":"paid"}','application/json')).status,400);assert.equal((await post('id=tr_x',undefined,'?status=paid')).status,400);assert.equal((await fetch(origin+shopTestWebhookPath)).status,405);
  assert.equal((await f.db.query('SELECT 1 FROM shop_test_payment_queue')).rows.length,1);assert.equal((await f.db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'open');assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,0);
  const failing=createShopTestWebhook({query:async()=>{throw Error('private provider secret');}},{enabled:true});const res={writeHead(status){this.status=status;},end(body){this.body=body;}};await failing.handle(Object.assign(Readable.from([Buffer.from('id=tr_x')]),{url:shopTestWebhookPath,method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'}}),res);assert.equal(res.status,503);assert.ok(!res.body.includes('private'));
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});
test('worker reconciles fresh TEST proof exactly once and retains a callback arriving during lookup',async()=>{
 const f=await setup();try{
  let reads=0;const fetchPayment=async id=>{reads++;assert.equal(id,f.proof().id);if(reads===1)await enqueueShopTestPayment(f.pool,id);return f.proof();};
  assert.equal((await processShopTestPayment(f.pool,{fetchPayment})).state,'pending');assert.equal((await processShopTestPayment(f.pool,{fetchPayment})).state,'done');assert.equal(reads,2);assert.equal(f.posts(),1);assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,1);assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'open');
  for(const table of ['company_entitlements','company_features','billing_transactions'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);assert.equal((await processShopTestPayment(f.pool,{fetchPayment})).processed,false);
 }finally{await f.db.close();}
});
test('transient provider failure backs off and exhausts into review without leaking diagnostics',async()=>{
 const f=await setup();try{
  let reads=0;const fetchPayment=async()=>{reads++;throw Error('test_private_key');};
  assert.equal((await processShopTestPayment(f.pool,{fetchPayment})).state,'pending');assert.equal((await f.queue()).last_error,'RETRY_UNAVAILABLE');assert.equal((await processShopTestPayment(f.pool,{fetchPayment})).processed,false);assert.equal(reads,1);
  for(let i=1;i<8;i++){await f.db.exec("UPDATE shop_test_payment_queue SET next_at=clock_timestamp()-interval '1 second'");await processShopTestPayment(f.pool,{fetchPayment});}
  assert.equal((await f.queue()).state,'review');assert.equal(reads,8);await enqueueShopTestPayment(f.pool,f.proof().id);assert.equal((await processShopTestPayment(f.pool,{fetchPayment})).processed,false);assert.ok(!JSON.stringify(await f.queue()).includes('private'));assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,0);
 }finally{await f.db.close();}
});
test('acknowledgement failure after payment commit replays the same licence intent after lease expiry',async()=>{
 const f=await setup();try{
  const faulty={...f.pool,query:async(sql,args)=>{if(sql.startsWith('UPDATE shop_test_payment_queue SET'))throw Error('injected acknowledgement failure');return f.pool.query(sql,args);}};
  await assert.rejects(processShopTestPayment(faulty,{fetchPayment:async()=>f.proof()}),/injected acknowledgement/);assert.equal((await f.queue()).state,'working');assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,1);
  await f.db.exec("UPDATE shop_test_payment_queue SET lease_until=clock_timestamp()-interval '1 second'");assert.equal((await processShopTestPayment(f.pool,{fetchPayment:async()=>f.proof()})).state,'done');assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,1);
 }finally{await f.db.close();}
});
test('stale lease acknowledgements cannot overwrite a newer lease',async()=>{
 const f=await setup();try{
  const newer=crypto.randomUUID();const result=await processShopTestPayment(f.pool,{fetchPayment:async()=>{await f.db.query('UPDATE shop_test_payment_queue SET lease_token=$1',[newer]);return f.proof();}});assert.equal(result.state,'superseded');assert.equal((await f.queue()).lease_token,newer);
 }finally{await f.db.close();}
});
test('LIVE, foreign and refunded proofs enter review, never licensing',async t=>{
 for(const kind of ['live-binding','live-proof','foreign-proof','refunded'])await t.test(kind,async()=>{const f=await setup();try{
  let reads=0;if(kind==='live-binding')await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");
  const result=await processShopTestPayment(f.pool,{fetchPayment:async()=>{reads++;const p=f.proof();if(kind==='live-proof')p.mode='live';if(kind==='foreign-proof')p.metadata.shopCompanyId=f.b;if(kind==='refunded')p.amountRefunded={currency:'EUR',value:'1.00'};return p;}});
  assert.equal(result.state,'review');assert.equal((await f.queue()).last_error,'PAYMENT_REVIEW');if(kind==='live-binding')assert.equal(reads,0);assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,0);
 }finally{await f.db.close();}});
});
test('opt-in TEST webhook URL is fixed to the approved origin and never enabled by default',async()=>{
 const calls=[],c=command('once');await createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',webhookEnabled:true,fetcher:gateway(calls)}).submit(c);assert.equal(JSON.parse(calls[0].options.body).webhookUrl,'https://fixture.example.test'+shopTestWebhookPath);
 const disabled=[];await createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(disabled)}).submit(command('once'));assert.equal(JSON.parse(disabled[0].options.body).webhookUrl,undefined);assert.throws(()=>createShopMollieTestAdapter({apiKey:'live_no',publicOrigin:'https://fixture.example.test',webhookEnabled:true}));assert.throws(()=>createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',webhookEnabled:'true'}));
});
test('simulated adapter→HTTP callback→durable worker→TEST preview; later refund blocks replay',async()=>{
 const f=await setup({dispatch:false});await migrateShopTestFulfilment(f.pool);let posts=0,reads=0,proof,refunded=false;
 const adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',webhookEnabled:true,fetcher:async(url,options)=>{
  assert.ok(url.startsWith('https://api.mollie.com/v2/payments'));if(options.method==='GET'){reads++;return Response.json({...proof,status:'paid',...(refunded?{amountRefunded:{currency:'EUR',value:'1.00'}}:{})});}
  posts++;const body=JSON.parse(options.body);assert.equal(body.webhookUrl,'https://fixture.example.test'+shopTestWebhookPath);proof={...body,id:'tr_pipeline',mode:'test',resource:'payment',status:'open',_links:{checkout:{href:'https://checkout.mollie.com/fixture'}}};return Response.json(proof);
 }});
 const receiver=createShopTestWebhook(f.pool,{enabled:true}),server=http.createServer(async(req,res)=>{if(!await receiver.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  await dispatchPreparedShopCheckout(f.pool,{id:f.order.id,submit:adapter.submit});
  for(let i=0;i<2;i++){assert.equal((await fetch(`http://127.0.0.1:${server.address().port}`+shopTestWebhookPath,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'id=tr_pipeline'})).status,200);assert.equal((await processShopTestPayment(f.pool,{fetchPayment:adapter.fetchPayment})).state,'done');}
  assert.equal((await rehearseShopTestFulfilment(f.pool,{id:f.order.id,fetchPayment:adapter.fetchPayment})).invoiceIssued,false);assert.equal(posts,1);assert.equal(reads,3);assert.equal((await f.db.query('SELECT 1 FROM shop_license_jobs')).rows.length,1);
  refunded=true;await enqueueShopTestPayment(f.pool,'tr_pipeline');assert.equal((await processShopTestPayment(f.pool,{fetchPayment:adapter.fetchPayment})).state,'review');await assert.rejects(rehearseShopTestFulfilment(f.pool,{id:f.order.id,fetchPayment:adapter.fetchPayment}),{code:'PROVIDER_MISMATCH'});
  assert.equal((await f.db.query('SELECT 1 FROM company_entitlements')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,0);assert.equal((await f.db.query('SELECT status FROM shop_license_jobs')).rows[0].status,'pending');assert.equal(posts,1);
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});

test('a mismatched reservation enters review without licence work or automatic retry',async()=>{
 const f=await setup();try{
  await f.db.query('UPDATE billing_checkout_guards SET plan_id=$1',[f.online]);let reads=0;
  const run=()=>processShopTestPayment(f.pool,{fetchPayment:async()=>{reads++;return f.proof();}});
  assert.equal((await run()).state,'review');assert.equal(reads,1);assert.equal((await f.queue()).last_error,'PAYMENT_REVIEW');
  await enqueueShopTestPayment(f.pool,f.proof().id);assert.equal((await run()).processed,false);assert.equal(reads,1);
  assert.equal((await f.db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'open');
  for(const table of ['shop_license_jobs','company_entitlements','billing_transactions'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
 }finally{await f.db.close();}
});
test('late paid callback after confirmed failure cannot resurrect a canceled draft',async()=>{
 const f=await setup();try{
  assert.equal((await processShopTestPayment(f.pool,{fetchPayment:async()=>({...f.proof(),status:'failed'})})).state,'done');
  assert.equal((await f.db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'failed');
  await enqueueShopTestPayment(f.pool,f.proof().id);
  assert.equal((await processShopTestPayment(f.pool,{fetchPayment:async()=>f.proof()})).state,'review');
  assert.equal((await f.db.query('SELECT status FROM shop_checkout_orders')).rows[0].status,'failed');
  assert.equal((await f.db.query('SELECT status FROM shop_order_drafts')).rows[0].status,'canceled');
  assert.equal((await f.db.query('SELECT status FROM billing_checkout_guards')).rows[0].status,'resolved');
  for(const table of ['shop_license_jobs','company_entitlements','billing_transactions'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
  assert.equal(f.posts(),1);
 }finally{await f.db.close();}
});

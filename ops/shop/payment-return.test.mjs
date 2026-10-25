import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {shopPaymentReturnUrl} from '../../server/shop-payment-return-url.js';
import {createShopMollieTestAdapter} from '../../server/shop-mollie-test-adapter.js';
import {command,gateway} from './provider-fixture.mjs';
import {readPaymentReturnLocation,paymentReturnHref,legacyPaymentReturn,validPaymentReturnOrder} from '../../apps/web/public/shop/payment-return-state.js';
import {readPaymentReturnOrder} from '../../apps/web/public/shop/payment-return-client.js';
import {downloadFixture} from './download-fixture.mjs';
import {createShopRuntime} from '../../server/shop-http.js';
const id=crypto.randomUUID();
test('canonical provider URL contains only the reference and landing converts to a local fragment',()=>{
 const url=shopPaymentReturnUrl('https://fixture.example.test',id);assert.equal(url,'https://fixture.example.test/shop/payment-return.html?checkout='+id);assert.equal(readPaymentReturnLocation(url),id);assert.equal(readPaymentReturnLocation('https://fixture.example.test'+paymentReturnHref(id)),id);assert.equal(readPaymentReturnLocation(url.replace(id,id.toUpperCase())),id);
 for(const origin of ['http://fixture.test','https://fixture.test/path','https://user:pass@fixture.test','https://fixture.test?token=x'])assert.throws(()=>shopPaymentReturnUrl(origin,id));assert.throws(()=>shopPaymentReturnUrl('https://fixture.test','bad'));
});
test('ambiguous and forged return parameters never become a payment proof or reference',()=>{
 for(const suffix of ['','?checkout=bad','?checkout='+id+'&checkout='+id,'?checkout='+id+'&paid=true','?checkout='+id+'&status=paid','?checkout='+id+'&token=secret','?checkout='+id+'#checkout='+id,'#checkout='+id+'&provider_payment_id=tr_fake'])assert.equal(readPaymentReturnLocation('https://fixture.test/shop/payment-return.html'+suffix),null);
 assert.deepEqual(legacyPaymentReturn('https://fixture.test/shop/?checkout=return&order='+id),{id});assert.deepEqual(legacyPaymentReturn('https://fixture.test/shop/?checkout=return&order='+id+'&status=paid'),{invalid:true});assert.equal(legacyPaymentReturn('https://fixture.test/shop/?q=POS'),null);assert.equal(readPaymentReturnLocation('x'.repeat(4097)),null);
});
test('monthly and one-off TEST creation both use the protected return landing',async()=>{
 for(const period of ['monthly','once']){const calls=[],c=command(period),adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(calls)});await adapter.submit(c);const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.redirectUrl,shopPaymentReturnUrl('https://fixture.example.test',c.orderId));assert.equal(new URL(body.redirectUrl).searchParams.get('token'),null);assert.equal(body.testmode,undefined);}
});
test('return response validation preserves monthly contract amounts and refuses releases or mismatched identities',()=>{
 const row={version:1,id,draftId:crypto.randomUUID(),requestId:crypto.randomUUID(),status:'paid',snapshot:{productId:'pos-online',planCode:'pos_base_monthly',period:'monthly',currency:'EUR',netCents:2999,vatCents:570,grossCents:3569},canPay:false,canActivate:false,checkoutConnected:false};assert.equal(validPaymentReturnOrder(row,id),true);
 for(const patch of [{id:crypto.randomUUID()},{status:'completed'},{canPay:true},{canActivate:true},{snapshot:{...row.snapshot,grossCents:1}},{snapshot:{...row.snapshot,period:'once'}}])assert.equal(validPaymentReturnOrder({...row,...patch},id),false);
});
test('real HTTP return lookup reads recorded state only and enforces account/role without provider calls',async()=>{
 const f=await downloadFixture({accept:false,paid:false}),runtime=createShopRuntime(f.pool,{enabled:true});await runtime.migrate();const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,calls=[];
 try{
  const read=token=>readPaymentReturnOrder({id:f.order.id,token,fetcher:(url,options)=>{calls.push({url,options});return fetch(origin+url,options);}});assert.equal((await read('owner-a')).status,'prepared');await f.consent();await f.progress();const receiptsBefore=(await f.db.query('SELECT * FROM shop_download_invoice_consents')).rows;const paid=await read('owner-a');assert.equal(paid.status,'paid');assert.equal(paid.canActivate,false);assert.equal(paid.canPay,false);
  for(const [token,code]of [['owner-b','CHECKOUT_NOT_FOUND'],['waiter','FORBIDDEN'],['expired','UNAUTHORIZED'],['inactive','UNAUTHORIZED']])await assert.rejects(read(token),{code});assert.ok(calls.every(c=>c.options.method==='GET'&&c.options.credentials==='omit'&&c.options.redirect==='error'));
  for(const key of ['provider_payment_id','session_hash','checkout_url','buyer','billing_snapshot'])assert.equal(JSON.stringify(paid).includes(key),false);for(const table of ['billing_transactions','company_entitlements'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);assert.deepEqual((await f.db.query('SELECT * FROM shop_download_invoice_consents')).rows,receiptsBefore);
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});
test('invalid requests and arbitrary network diagnostics fail closed before rendering',async()=>{
 let requests=0;const fetcher=async()=>{requests++;throw Error('private provider credentials');};await assert.rejects(readPaymentReturnOrder({id:'bad',token:'fixture',fetcher}),{code:'INVALID_REQUEST'});await assert.rejects(readPaymentReturnOrder({id,token:'',fetcher}),{code:'UNAUTHORIZED'});assert.equal(requests,0);await assert.rejects(readPaymentReturnOrder({id,token:'fixture',fetcher}),e=>e.code==='SHOP_UNAVAILABLE'&&!e.message.includes('private'));
});

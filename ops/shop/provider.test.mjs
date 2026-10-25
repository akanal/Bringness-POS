import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {createShopMollieTestAdapter} from '../../server/shop-mollie-test-adapter.js';import {matchesShopPayment,matchesShopLivePayment,safeCheckoutUrl} from '../../server/shop-provider-proof.js';
import {command,payment,gateway} from './provider-fixture.mjs';
test('adapter rejects LIVE and ambiguous credentials without requests',()=>{for(const apiKey of['live_fixture','','Bearer test_fixture',null])assert.throws(()=>createShopMollieTestAdapter({apiKey,publicOrigin:'https://fixture.example.test'}),{code:'TEST_KEY_REQUIRED'});});
test('public origin is strict HTTPS origin',()=>{for(const publicOrigin of['http://example.test','https://example.test/path','https://user:pass@example.test','https://example.test?x=1','https://example.test:444'])assert.throws(()=>createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin}),{code:'INVALID_PUBLIC_ORIGIN'});});
test('monthly TEST adapter binds customer metadata and stable distinct keys',async()=>{const calls=[],c=command(),adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(calls)});const p=await adapter.submit(c);assert.equal(p.mode,'test');assert.equal(calls.length,2);assert.equal(calls[0].options.headers['Idempotency-Key'],c.orderId+':customer');assert.equal(calls[1].options.headers['Idempotency-Key'],c.orderId+':payment');const body=JSON.parse(calls[1].options.body);assert.deepEqual(body.amount,{currency:'EUR',value:'35.69'});assert.equal(body.customerId,'cst_fixture');assert.equal(body.sequenceType,'first');assert.equal(body.testmode,undefined);assert.equal(body.webhookUrl,undefined);assert.equal(body.profileId,undefined);});
test('download one-off never creates customer or mandate',async()=>{const calls=[],adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(calls)});await adapter.submit(command('once'));assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body);assert.equal(body.sequenceType,'oneoff');assert.equal(body.customerId,undefined);assert.equal(body.amount.value,'474.81');});
test('provider response mismatch is closed',async()=>{for(const change of[p=>({...p,mode:'live'}),p=>({...p,amount:{currency:'EUR',value:'0.01'}}),p=>({...p,metadata:{...p.metadata,shopCompanyId:crypto.randomUUID()}}),p=>({...p,customerId:'cst_wrong'}),p=>({...p,sequenceType:'recurring'}),p=>({...p,_links:{checkout:{href:'https://evil.example.test'}}})]){const calls=[],adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(calls,change)});await assert.rejects(adapter.submit(command()),{code:'PROVIDER_MISMATCH'});assert.equal(calls.length,2);}});
test('no automatic provider retries or sensitive diagnostics',async()=>{let n=0;const adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:async()=>{n++;throw Error('sensitive provider diagnostic');}});await assert.rejects(adapter.submit(command()),e=>e.code==='PROVIDER_UNCERTAIN'&&!e.message.includes('sensitive'));assert.equal(n,1);});
test('provider GET has fixed origin, validates mode and payment identity',async()=>{const c=command(),p=payment(c);const adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:async(url,options)=>{assert.equal(url,'https://api.mollie.com/v2/payments/'+p.id);assert.equal(options.method,'GET');return Response.json(p);}});assert.deepEqual(await adapter.fetchPayment(p.id),p);await assert.rejects(adapter.fetchPayment('../payments'),{code:'INVALID_REQUEST'});});
test('proof refuses refunds, chargebacks, subscriptions, foreign order and invalid URLs',()=>{const c=command(),order={id:c.orderId,company_id:c.companyId,snapshot:c},p=payment(c);assert.equal(matchesShopPayment(order,p),true);for(const change of[{amountRefunded:{currency:'EUR',value:'0.01'}},{amountChargedBack:{currency:'EUR',value:'1.00'}},{subscriptionId:'sub_fixture'},{metadata:{...p.metadata,shopOrderId:crypto.randomUUID()}},{amount:{currency:'USD',value:'35.69'}}])assert.equal(matchesShopPayment(order,{...p,...change}),false);for(const url of['http://www.mollie.com/a','https://www.mollie.com.evil.test/a','https://user@www.mollie.com/a','https://www.mollie.com:444/a','https://www.mollie.com/a#x'])assert.equal(safeCheckoutUrl(url),false);});

test('payment proof binds recorded mode and rejects malformed order amounts and periods',()=>{
 const c=command(),order={id:c.orderId,company_id:c.companyId,snapshot:c},p=payment(c);
 for(const provider_mode of [null,undefined,'test'])assert.equal(matchesShopPayment({...order,provider_mode},p),true);
 for(const provider_mode of ['live','TEST','unknown',''])assert.equal(matchesShopPayment({...order,provider_mode},p),false);
 const live={...p,mode:'live'};assert.equal(matchesShopLivePayment({...order,provider_mode:'live'},live),true);
 assert.equal(matchesShopLivePayment({...order,provider_mode:'test'},live),false);
 for(const patch of [{currency:'USD'},{currency:null},{period:'annual'},{period:null},{grossCents:0},{grossCents:-1},{grossCents:35.69},{grossCents:'3569'},{grossCents:NaN},{grossCents:Number.MAX_SAFE_INTEGER+1}]){
  const changed={...order,snapshot:{...c,...patch}};assert.equal(matchesShopPayment(changed,p),false);assert.equal(matchesShopLivePayment(changed,live),false);
 }
});

test('canonical product and tax breakdown are required before transport and for TEST/LIVE proof',async()=>{
 for(const period of ['monthly','once']){
  const c=command(period),p=payment(c),order={id:c.orderId,company_id:c.companyId,snapshot:c};
  const changes=[{productId:'unknown'},{planCode:'unknown'},{productId:period==='monthly'?'pos-download':'pos-online'},{period:period==='monthly'?'once':'monthly'},{netCents:c.netCents-1},{vatCents:c.vatCents+1},{netCents:undefined},{vatCents:undefined},{netCents:String(c.netCents)},{vatCents:-1},{netCents:0,vatCents:c.grossCents}];
  for(const patch of changes){
   const altered={...c,...patch},badOrder={...order,snapshot:altered};let calls=0;
   const adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:async()=>{calls++;throw Error('must not dispatch');}});
   await assert.rejects(adapter.submit(altered),{code:'INVALID_PROVIDER_COMMAND'});assert.equal(calls,0);
   assert.equal(matchesShopPayment(badOrder,p),false);assert.equal(matchesShopLivePayment({...badOrder,provider_mode:'live'},{...p,mode:'live'}),false);
  }
  assert.equal(matchesShopPayment(order,p),true);assert.equal(matchesShopLivePayment({...order,provider_mode:'live'},{...p,mode:'live'}),true);
 }
});
test('special contract amounts keep their original consistent tax breakdown',async()=>{
 const c={...command(),netCents:1001,vatCents:190,grossCents:1191},calls=[];
 const adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(calls)});
 assert.equal((await adapter.submit(c)).amount.value,'11.91');assert.equal(calls.length,2);
});

test('malformed buyer contacts fail before even creating a provider customer',async()=>{
 for(const patch of [{email:'@'},{email:'name@'},{email:'@example.test'},{email:'a@@example.test'},{email:'a b@example.test'},{email:'a@example.test\n'},{email:'a@exam\u0000ple.test'},{email:'x'.repeat(255)+'@example.test'},{name:{unexpected:true}},{name:'Bad\nName'},{name:'x'.repeat(501)}]){
  let calls=0;const c=command(),adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:async()=>{calls++;throw Error('must not dispatch');}});
  await assert.rejects(adapter.submit({...c,buyer:{...c.buyer,...patch}}),{code:'INVALID_PROVIDER_COMMAND'});assert.equal(calls,0);
 }
 for(const email of ['sales+shop@example.test','first.last@example.test','müller@example.test']){
  const c=command(),calls=[],adapter=createShopMollieTestAdapter({apiKey:'test_fixture',publicOrigin:'https://fixture.example.test',fetcher:gateway(calls)});await adapter.submit({...c,buyer:{...c.buyer,email}});assert.equal(JSON.parse(calls[0].options.body).email,email);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMarketplaceMollieTestResolver} from './shop-mollie-marketplace-test-adapter.js';

const token='access_fixture_private_oauth_token';
function fixture(){
 const seller=randomUUID(),binding={kind:'mollie-oauth',mode:'test',status:'verified',sellerCompanyId:seller,connectionId:randomUUID(),merchantId:'org_fixture',profileId:'pfl_fixture'};
 const command={mode:'test',orderId:randomUUID(),sellerCompanyId:seller,merchantId:binding.merchantId,amountCents:1190,currency:'EUR',idempotencyKey:'market-test:'+randomUUID()};
 const calls=[];let payments=[],saved,failPost=false,transform=x=>x,customNext,customList,organization='org_fixture',profileStatus='verified',currentToken=token;
 const raw=(c=command,id='tr_fixture')=>({resource:'payment',id,mode:'test',profileId:binding.profileId,status:'open',sequenceType:'oneoff',amount:{currency:'EUR',value:(c.amountCents/100).toFixed(2)},metadata:{marketOrderId:c.orderId,marketSellerCompanyId:seller,marketCheckoutKey:c.idempotencyKey},_links:{checkout:{href:'https://checkout.mollie.com/test'}}});
 const fetcher=async(url,options)=>{
  calls.push({url,options});const u=new URL(url);let value;
  if(u.pathname==='/v2/organizations/me')value={id:organization};
  else if(u.pathname==='/v2/profiles/'+binding.profileId)value={id:binding.profileId,status:profileStatus};
  else if(options.method==='POST'){
   const body=JSON.parse(options.body);saved=raw({...command,amountCents:Number(body.amount.value)*100});saved.metadata=body.metadata;saved.profileId=body.profileId;
   payments=[saved];if(failPost)throw Error('lost '+token);value=saved;
  }else if(u.pathname==='/v2/payments')value=customList?customList(u):{count:payments.length,_embedded:{payments},_links:{next:customNext?{href:customNext}:null}};
  else value=saved||raw();
  return new Response(JSON.stringify(transform(value,u)),{status:200,headers:{'content-type':'application/json'}});
 };
 const options={publicOrigin:'https://bringness.de',loadConnection:async id=>{assert.equal(id,seller);return binding;},withAccessToken:async(id,revision,fn)=>{assert.equal(id,seller);assert.equal(revision,binding.connectionId);return fn(currentToken);},fetcher};
 return {seller,binding,command,raw,calls,options,get payments(){return payments;},set payments(v){payments=v;},get saved(){return saved;},set saved(v){saved=v;},set failPost(v){failPost=v;},set transform(v){transform=v;},set customNext(v){customNext=v;},set customList(v){customList=v;},set organization(v){organization=v;},set profileStatus(v){profileStatus=v;},set currentToken(v){currentToken=v;},async adapter(){return createMarketplaceMollieTestResolver(options)(seller);}};
}
test('marketplace Mollie test adapter binds OAuth seller, profile, cents and immutable request identity',async()=>{
 const f=fixture(),a=await f.adapter(),result=await a.createPayment(f.command);
 assert.equal(result.mode,'test');assert.equal(result.amountCents,1190);assert.equal(result.merchantId,'org_fixture');
 assert.deepEqual(f.calls.map(c=>new URL(c.url).pathname),['/v2/organizations/me','/v2/profiles/pfl_fixture','/v2/payments']);
 const post=f.calls.at(-1),body=JSON.parse(post.options.body);
 assert.equal(post.options.headers['Idempotency-Key'],f.command.idempotencyKey);assert.equal(body.amount.value,'11.90');
 assert.equal(body.profileId,'pfl_fixture');assert.equal(body.testmode,true);assert.equal(body.sequenceType,'oneoff');
 assert.equal(body.metadata.marketCheckoutKey,f.command.idempotencyKey);assert.equal(body.redirectUrl,'https://bringness.de/shop/order-history.html?marketOrderId='+f.command.orderId);
 for(const c of f.calls){assert.equal(c.options.headers.Authorization,'Bearer '+token);assert.equal(c.options.redirect,'error');assert.ok(c.options.signal instanceof AbortSignal);}
 assert.equal(JSON.stringify(result).includes(token),false);assert.equal(JSON.stringify(a).includes(token),false);
 assert.equal(Object.hasOwn(body,'applicationFee'),false);assert.equal(Object.hasOwn(body,'webhookUrl'),false);
});
test('large safe integer cents use exact decimal formatting without binary rounding',async()=>{
 const f=fixture();f.command.amountCents=Number.MAX_SAFE_INTEGER;
 // Validate request body rather than use the floating-point fixture response.
 f.options.fetcher=async(url,options)=>{
  const path=new URL(url).pathname;let result;
  if(path.endsWith('organizations/me'))result={id:'org_fixture'};
  else if(path.includes('/profiles/'))result={id:'pfl_fixture',status:'verified'};
  else{const body=JSON.parse(options.body);assert.equal(body.amount.value,'90071992547409.91');result={...f.raw(),amount:body.amount};}
  return Response.json(result);
 };
 assert.equal((await (await f.adapter()).createPayment(f.command)).amountCents,Number.MAX_SAFE_INTEGER);
});
test('missing, live, unverified and foreign connections reject without provider I/O',async()=>{
 for(const change of [{kind:'api-key'},{mode:'live'},{status:'pending'},{sellerCompanyId:randomUUID()},{connectionId:'bad'},{merchantId:'evil'},{profileId:'bad'}]){
  const f=fixture();Object.assign(f.binding,change);await assert.rejects(f.adapter(),/MARKET_MERCHANT_NOT_CONNECTED/);assert.equal(f.calls.length,0);
 }
 const f=fixture();f.options.loadConnection=async()=>null;await assert.rejects(f.adapter(),/MARKET_MERCHANT_NOT_CONNECTED/);
});
test('invalid config and public origins cannot redirect credentials or browser returns',()=>{
 const f=fixture();for(const publicOrigin of ['http://bringness.de','https://bringness.de/','https://bringness.de/x','https://user:pass@bringness.de','https://bringness.de#x'])assert.throws(()=>createMarketplaceMollieTestResolver({...f.options,publicOrigin}),/INVALID_MARKET_PROVIDER_ORIGIN/);
 for(const maxRecoveryPages of [0,11,1.5])assert.throws(()=>createMarketplaceMollieTestResolver({...f.options,maxRecoveryPages}),/INVALID_MARKET_PROVIDER_CONFIG/);
 assert.throws(()=>createMarketplaceMollieTestResolver(),/INVALID_MARKET_PROVIDER_CONFIG/);
});
test('malformed commands and references fail before any payment API call',async()=>{
 for(const change of [{mode:'live'},{sellerCompanyId:randomUUID()},{merchantId:'org_other'},{orderId:'bad'},{idempotencyKey:'unstable'},{currency:'USD'},{amountCents:0},{amountCents:1.2},{amountCents:Infinity}]){
  const f=fixture(),a=await f.adapter();await assert.rejects(a.createPayment({...f.command,...change}),/INVALID_MARKET_PROVIDER_COMMAND/);assert.equal(f.calls.length,0);
 }
 const f=fixture(),a=await f.adapter();await assert.rejects(a.fetchPayment('../profiles'),/INVALID_MARKET_PROVIDER_COMMAND/);assert.equal(f.calls.length,0);
});
test('Mollie organization/profile verification blocks a wrong account before payment creation',async()=>{
 for(const change of ['organization','profileStatus']){
  const f=fixture();f[change]='wrong';await assert.rejects((await f.adapter()).createPayment(f.command),/MARKET_MERCHANT_NOT_CONNECTED/);
  assert.equal(f.calls.some(c=>c.options.method==='POST'),false);
 }
});
test('test API keys and live keys cannot stand in for merchant OAuth credentials',async()=>{
 for(const value of ['test_1234567890','live_1234567890','bad','access\nsecret']){
  const f=fixture();f.currentToken=value;await assert.rejects((await f.adapter()).createPayment(f.command),/MARKET_OAUTH_TOKEN_REQUIRED/);assert.equal(f.calls.length,0);
 }
});
test('changed or revoked connection is rechecked before dispatch',async()=>{
 const f=fixture(),a=await f.adapter();f.binding.connectionId=randomUUID();await assert.rejects(a.createPayment(f.command),/MARKET_MERCHANT_CHANGED/);assert.equal(f.calls.length,0);
 const g=fixture(),b=await g.adapter();g.binding.status='revoked';await assert.rejects(b.createPayment(g.command),/MARKET_MERCHANT_NOT_CONNECTED/);assert.equal(g.calls.length,0);
});
test('provider error, non-JSON and response overflow remain uncertain without leaking tokens',async()=>{
 const responders=[async()=>{throw Error(token);},async()=>new Response('bad',{status:429}),async()=>new Response('{}',{headers:{'content-type':'text/html'}}),async()=>new Response('{',{headers:{'content-type':'application/json'}}),async()=>new Response('x'.repeat(1024*1024+1),{headers:{'content-type':'application/json'}})];
 for(const fetcher of responders){const f=fixture();f.options.fetcher=fetcher;await assert.rejects((await f.adapter()).createPayment(f.command),e=>e.message==='MARKET_PAYMENT_UNCERTAIN'&&!e.message.includes(token));}
});
test('mismatched payment facts, refunds, recurring payments and unsafe links are rejected',async()=>{
 const changes=[{mode:'live'},{resource:'customer'},{profileId:'pfl_other'},{status:'unknown'},{sequenceType:'recurring'},{subscriptionId:'sub_x'},{applicationFee:{}},{routing:[]},{amount:{currency:'USD',value:'11.90'}},{amount:{currency:'EUR',value:'11.91'}},{amountRefunded:{currency:'EUR',value:'0.01'}},{amountChargedBack:{currency:'EUR',value:'0.01'}},{metadata:{marketOrderId:randomUUID()}},{_links:{checkout:{href:'https://evil.test'}}}];
 for(const change of changes){const f=fixture();f.transform=(raw,u)=>u.pathname==='/v2/payments'?{...raw,...change}:raw;await assert.rejects((await f.adapter()).createPayment(f.command),/MARKET_PAYMENT_MISMATCH/);}
});
test('paid statuses need no checkout URL and fetch results are normalized without provider metadata',async()=>{
 const f=fixture();f.saved={...f.raw(),status:'paid',_links:{}};
 const result=await (await f.adapter()).fetchPayment('tr_fixture');assert.equal(result.status,'paid');assert.equal(result.checkoutUrl,null);
 assert.equal(Object.hasOwn(result,'metadata'),false);assert.equal(f.calls.at(-1).options.method,'GET');
 assert.equal(new URL(f.calls.at(-1).url).searchParams.get('testmode'),'true');
 f.saved={...f.raw(),id:'tr_wrong'};await assert.rejects((await f.adapter()).fetchPayment('tr_fixture'),/MARKET_PAYMENT_MISMATCH/);
});
test('lost create response recovers by read-only lookup followed by verified exact payment fetch',async()=>{
 const f=fixture(),a=await f.adapter();f.failPost=true;await assert.rejects(a.createPayment(f.command),/MARKET_PAYMENT_UNCERTAIN/);
 const recovered=await (await f.adapter()).recoverPayment(f.command);assert.equal(recovered.id,'tr_fixture');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
 const last=f.calls.at(-1);assert.equal(new URL(last.url).pathname,'/v2/payments/tr_fixture');
});
test('empty recovery is read-only and never creates a replacement payment',async()=>{
 const f=fixture();assert.equal(await (await f.adapter()).recoverPayment(f.command),null);assert.equal(f.calls.some(c=>c.options.method==='POST'),false);
});
test('recovery checks every page for duplicate payment intents and wrong-order metadata',async()=>{
 const f=fixture();f.payments=[f.raw(),f.raw(f.command,'tr_second')];await assert.rejects((await f.adapter()).recoverPayment(f.command),/MARKET_RECOVERY_AMBIGUOUS/);
 const g=fixture();g.payments=[{...g.raw(),metadata:{...g.raw().metadata,marketOrderId:randomUUID()}}];await assert.rejects((await g.adapter()).recoverPayment(g.command),/MARKET_PAYMENT_MISMATCH/);
 const h=fixture();h.customList=u=>u.searchParams.has('from')?{count:1,_embedded:{payments:[h.raw(h.command,'tr_second')]},_links:{next:null}}:{count:1,_embedded:{payments:[h.raw()]},_links:{next:{href:'https://api.mollie.com/v2/payments?profileId=pfl_fixture&testmode=true&limit=50&sort=desc&from=tr_second'}}};
 await assert.rejects((await h.adapter()).recoverPayment(h.command),/MARKET_RECOVERY_AMBIGUOUS/);
});
test('recovery rejects incomplete lists, pagination injection, loops and bounded truncation',async()=>{
 const next='https://api.mollie.com/v2/payments?profileId=pfl_fixture&testmode=true&limit=50&sort=desc&from=tr_next';
 for(const value of ['https://evil.test/v2/payments','http://api.mollie.com/v2/payments',next+'&extra=x',next+'&profileId=pfl_fixture',next.replace('pfl_fixture','pfl_other'),next+'#fragment',next.replace('testmode=true','testmode=false'),next.replace('from=tr_next','from=bad')]){
  const f=fixture();f.customNext=value;await assert.rejects((await f.adapter()).recoverPayment(f.command),/MARKET_RECOVERY_INCOMPLETE/);assert.equal(f.calls.some(c=>new URL(c.url).hostname!=='api.mollie.com'),false);
 }
 const f=fixture();f.customNext=next;await assert.rejects((await f.adapter()).recoverPayment(f.command),/MARKET_RECOVERY_INCOMPLETE/);
 const g=fixture();g.options.maxRecoveryPages=1;g.customNext=next;await assert.rejects((await g.adapter()).recoverPayment(g.command),/MARKET_RECOVERY_INCOMPLETE/);
 const h=fixture();h.customList=()=>({count:2,_embedded:{payments:[]}});await assert.rejects((await h.adapter()).recoverPayment(h.command),/MARKET_RECOVERY_INCOMPLETE/);
});
test('safe pagination reconstructs fixed URLs and recovers a matching later payment',async()=>{
 const f=fixture(),next='https://api.mollie.com/v2/payments?profileId=pfl_fixture&testmode=true&limit=50&sort=desc&from=tr_next';
 f.saved=f.raw();f.customList=u=>u.searchParams.has('from')?{count:1,_embedded:{payments:[f.raw()]},_links:{next:null}}:{count:0,_embedded:{payments:[]},_links:{next:{href:next}}};
 assert.equal((await (await f.adapter()).recoverPayment(f.command)).id,'tr_fixture');assert.equal(f.calls.filter(c=>new URL(c.url).pathname==='/v2/payments').length,2);
});
test('repeated token callbacks cannot trigger a second create and revocation after I/O fails closed',async()=>{
 const f=fixture();f.options.withAccessToken=async(s,c,fn)=>{await fn(token);return fn(token);};await assert.rejects((await f.adapter()).createPayment(f.command),/MARKET_PROVIDER_CALLBACK_REPEATED/);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
 const g=fixture();g.transform=(raw,u)=>{if(u.pathname==='/v2/payments')g.binding.status='revoked';return raw;};await assert.rejects((await g.adapter()).createPayment(g.command),/MARKET_MERCHANT_NOT_CONNECTED/);assert.equal(g.calls.filter(c=>c.options.method==='POST').length,1);
});
test('host connection/token callback failures are sanitized and missing callback fails closed',async()=>{
 const f=fixture();f.options.loadConnection=async()=>{throw Error(token);};await assert.rejects(f.adapter(),e=>e.message==='MARKET_PAYMENT_UNCERTAIN');
 const g=fixture();g.options.withAccessToken=async()=>{throw Error(token);};await assert.rejects((await g.adapter()).createPayment(g.command),e=>e.message==='MARKET_PAYMENT_UNCERTAIN');assert.equal(g.calls.length,0);
 const h=fixture();h.options.withAccessToken=async()=>({status:'paid'});await assert.rejects((await h.adapter()).createPayment(h.command),/MARKET_MERCHANT_NOT_CONNECTED/);assert.equal(h.calls.length,0);
});

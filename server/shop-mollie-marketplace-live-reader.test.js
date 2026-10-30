import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMarketplaceLiveReader} from './shop-mollie-marketplace-live-reader.js';
function setup(){
 const b={mode:'live',status:'verified',sellerCompanyId:randomUUID(),connectionId:randomUUID(),merchantId:'org_fixture',profileId:'pfl_fixture'};
 const args={...b,orderId:randomUUID(),providerId:'tr_fixture',refundId:'re_fixture'};
 const raw={resource:'payment',mode:'live',id:args.providerId,profileId:b.profileId,sequenceType:'oneoff',status:'paid',amount:{currency:'EUR',value:'11.90'},amountRefunded:{currency:'EUR',value:'5.00'},metadata:{marketOrderId:args.orderId,marketSellerCompanyId:b.sellerCompanyId,marketCheckoutKey:'market-live:'+randomUUID()}};
 const refund={resource:'refund',mode:'live',id:args.refundId,paymentId:raw.id,status:'refunded',amount:{currency:'EUR',value:'5.00'}};
 const requests=[];const config={loadBinding:async()=>({...b}),withAccessToken:async(_seller,_id,fn)=>fn('fixture_oauth_access'),fetcher:async(url,options)=>{requests.push({url,options});const path=new URL(url).pathname;const value=path.endsWith('/organizations/me')?{id:b.merchantId}:path.endsWith('/profiles/'+b.profileId)?{id:b.profileId,status:'verified'}:path.includes('/refunds/')?refund:raw;return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/hal+json'}});}};
 return {b,args,raw,refund,requests,config,reader:createMarketplaceLiveReader(config)};
}
test('live OAuth reader uses only fixed GET endpoints, validates parent payment and leaves unknown provider fees explicit',async()=>{
 const f=setup();const p=await f.reader.fetchPayment(f.args);assert.equal(p.amountCents,1190);assert.equal(p.feeCents,null);assert.equal(p.mode,'live');assert.equal(Object.hasOwn(p,'metadata'),false);
 assert.equal((await f.reader.fetchRefund(f.args)).amountCents,500);
 for(const r of f.requests){assert.equal(r.options.method,'GET');assert.equal(new URL(r.url).origin,'https://api.mollie.com');assert.equal(new URL(r.url).search,'');assert.equal(r.options.body,undefined);}
});
test('TEST mode, other profile/order/seller, test intent, routing and recurring payments cannot become live evidence',async()=>{
 for(const change of [{mode:'test'},{profileId:'pfl_other'},{metadata:{}},{metadata:{marketOrderId:randomUUID()}},{subscriptionId:'sub_fixture'},{sequenceType:'first'},{applicationFee:{amount:1}},{routing:[]}]){const f=setup();Object.assign(f.raw,change);await assert.rejects(f.reader.fetchPayment(f.args),/LIVE_READER_PAYMENT/);}
 const f=setup();f.raw.metadata.marketCheckoutKey='market-test:'+randomUUID();await assert.rejects(f.reader.fetchPayment(f.args),/LIVE_READER_PAYMENT/);
});
test('wrong/revoked bindings, platform keys, replayed token callbacks and secret-bearing provider errors fail closed',async()=>{
 const f=setup();f.b.mode='test';await assert.rejects(f.reader.fetchPayment(f.args),/LIVE_READER_BINDING/);assert.equal(f.requests.length,0);
 const g=setup();await assert.rejects(createMarketplaceLiveReader({...g.config,withAccessToken:async(_s,_i,fn)=>fn('live_platform_key')}).fetchPayment(g.args),/LIVE_READER_TOKEN/);
 await assert.rejects(createMarketplaceLiveReader({...g.config,fetcher:()=>{throw Error('secret-provider-key');}}).fetchPayment(g.args),/^Error: LIVE_READER_UNAVAILABLE$/);
 await assert.rejects(createMarketplaceLiveReader({...g.config,withAccessToken:async(_s,_i,fn)=>{await fn('fixture_oauth_access');return fn('fixture_oauth_access');}}).fetchPayment(g.args),/LIVE_READER_TOKEN/);
});
test('refunds require the confirmed live parent, exact reference and completed amount; no refund can be initiated',async()=>{
 for(const change of [{mode:'test'},{id:'re_other'},{paymentId:'tr_other'},{status:'pending'},{amount:{currency:'EUR',value:'5.01'}}]){const f=setup();Object.assign(f.refund,change);await assert.rejects(f.reader.fetchRefund(f.args),/LIVE_READER_REFUND/);assert.ok(f.requests.every(r=>r.options.method==='GET'));}
});

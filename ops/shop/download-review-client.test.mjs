import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createDownloadReviewClient} from '../../apps/web/public/shop/download-review-client.js';
const id=crypto.randomUUID(),flags={canPay:false,canActivate:false,checkoutConnected:false};
const view=()=>({id,...flags,accepted:false,digest:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),seller:{name:'Synthetic seller'}});
test('client requires explicit acceptance of the displayed immutable view and performs no automatic write',async()=>{
 const calls=[],client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async(url,options)=>{calls.push({url,options});return Response.json(options.method==='GET'?view():{id,...flags,recorded:true,replay:false});}});
 const shown=await client.readConsent(id);assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');assert.throws(()=>{shown.seller.name='Changed';},TypeError);
 await assert.rejects(client.acceptConsent(shown),{code:'INVOICE_CONSENT_REQUIRED'});await assert.rejects(client.acceptConsent({...shown},{accepted:true}),{code:'CONSENT_NOT_READY'});assert.equal(calls.length,1);
 assert.equal((await client.acceptConsent(shown,{accepted:true})).recorded,true);assert.equal(calls.length,2);
 const options=calls[1].options;assert.deepEqual(JSON.parse(options.body),{accepted:true,acceptedDigest:shown.digest});assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.mode,'same-origin');assert.equal(options.headers.Authorization,'Bearer fixture');
 await assert.rejects(client.acceptConsent(shown,{accepted:true}),{code:'CONSENT_NOT_READY'});assert.equal(calls.length,2);
});
test('single flight prevents duplicate submission and busy reads preserve the displayed confirmation',async()=>{
 let resolve,calls=0;const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async(_url,options)=>{calls++;if(options.method==='GET')return Response.json(view());return new Promise(r=>resolve=r);}}),shown=await client.readConsent(id),pending=client.acceptConsent(shown,{accepted:true});
 await assert.rejects(client.acceptConsent(shown,{accepted:true}),{code:'REQUEST_BUSY'});await assert.rejects(client.readConsent(id),{code:'REQUEST_BUSY'});assert.equal(calls,2);
 resolve(Response.json({id,...flags,recorded:true}));await pending;
});
test('uncertain POST requires a matching receipt; missing receipt permits explicit retry only',async()=>{
 let posts=0,recorded=false;const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async(url,options)=>{
  if(options.method==='POST'){posts++;if(posts===1)throw Error('private connection details');return Response.json({id,...flags,recorded:true});}
  if(url.endsWith('consent-receipt'))return Response.json({id,...flags,recorded,...(recorded?{digest:'b'.repeat(64)}:{})});return Response.json(view());
 }}),shown=await client.readConsent(id);
 await assert.rejects(client.acceptConsent(shown,{accepted:true}),e=>e.code==='REQUEST_UNCERTAIN'&&!e.message.includes('private'));
 recorded=true;await assert.rejects(client.readReceipt(id),{code:'CONSENT_CONFLICT'});await assert.rejects(client.acceptConsent(shown,{accepted:true}),{code:'CONSENT_REVIEW_REQUIRED'});assert.equal(posts,1);
 recorded=false;assert.equal((await client.readReceipt(id)).recorded,false);assert.equal(posts,1);await client.acceptConsent(shown,{accepted:true});assert.equal(posts,2);
});
test('account changes prevent stale acceptance and discard late account responses',async()=>{
 let token='account-a',calls=0,resolve;const client=createDownloadReviewClient({getToken:()=>token,fetcher:async()=>{calls++;if(calls===1)return Response.json(view());return new Promise(r=>resolve=r);}}),shown=await client.readConsent(id);
 token='account-b';await assert.rejects(client.acceptConsent(shown,{accepted:true}),{code:'ACCOUNT_CHANGED'});assert.equal(calls,1);
 const pending=client.readConsent(id);token='account-c';resolve(Response.json(view()));await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});
});
test('invalidate discards a pending POST result; timeout never retries and releases the request lock',async()=>{
 let resolve;const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async(_url,options)=>options.method==='GET'?Response.json(view()):new Promise(r=>resolve=r)}),shown=await client.readConsent(id),pending=client.acceptConsent(shown,{accepted:true});
 client.invalidate();resolve(Response.json({id,...flags,recorded:true}));await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});
 let requests=0;const timed=createDownloadReviewClient({timeoutMs:10,getToken:()=> 'fixture',fetcher:async(_url,options)=>{requests++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('private abort'),{code:20})),{once:true}));}});
 await assert.rejects(timed.readConsent(id),{code:'REQUEST_UNCERTAIN'});assert.equal(requests,1);await assert.rejects(timed.readConsent(id),{code:'REQUEST_UNCERTAIN'});assert.equal(requests,2);
});
test('malformed server flags, expired consent, invalid IDs and missing tokens fail closed',async()=>{
 const invalid=createDownloadReviewClient({getToken:()=>'',fetcher:()=>{throw Error('unexpected fetch');}});await assert.rejects(invalid.readConsent('bad'),{code:'INVALID_REQUEST'});await assert.rejects(invalid.readConsent(id),{code:'UNAUTHORIZED'});
 for(const payload of [{...view(),canActivate:true},{...view(),id:crypto.randomUUID()},{...view(),accepted:true},{...view(),expiresAt:'2000-01-01'}]){
  const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async()=>Response.json(payload)});await assert.rejects(client.readConsent(id));
 }
 const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async()=>Response.json({id,...flags,status:'paid',licence:'active',purchaseCompleted:true,invoiceDelivered:true,invoicePreviewAvailable:true})});await assert.rejects(client.readStatus(id),{code:'INVALID_RESPONSE'});
});

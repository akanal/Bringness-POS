import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {downloadFixture,seller} from './download-fixture.mjs';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
import {createDownloadReviewClient} from '../../apps/web/public/shop/download-review-client.js';
const publicOrigin='https://fixture.example.test';
async function setup(){
 const f=await downloadFixture({accept:false,paid:false}),runtime=createShopDownloadRuntime(f.pool,{enabled:true,seller,publicOrigin});await runtime.migrate();
 const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`,path=`/api/v1/shop/downloads/${f.order.id}/`;
 const call=(action,options={})=>fetch(origin+path+action,{...options,headers:{Authorization:'Bearer owner-a',...options.headers}});
 const close=async()=>{await new Promise(r=>server.close(r));await f.db.close();};return {...f,runtime,call,close,origin,path};
}
const response=()=>({status:0,headers:{},value:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(raw){this.value=JSON.parse(raw);}});
test('candidate router stays disabled with no database/config activity and does not intercept other routes',async()=>{
 const runtime=createShopDownloadRuntime({},{});await runtime.migrate();assert.equal(await runtime.handle({url:'/api/v1/shop/downloads/anything'},{}),false);
 const enabled=createShopDownloadRuntime({},{enabled:true,seller,publicOrigin});assert.equal(await enabled.handle({url:'/api/v1/pos/status'},{}),false);
 for(const options of [{seller:{}},{publicOrigin:'http://fixture.test'},{publicOrigin:publicOrigin+'/path'},{publicOrigin:'https://user:pass@fixture.test'}])assert.throws(()=>createShopDownloadRuntime({},{enabled:true,seller,publicOrigin,...options}));
});
test('failed migrations fail closed and retry; concurrent callers share one migration',async()=>{
 let fail=true,queries=0;const runtime=createShopDownloadRuntime({query:async()=>{queries++;if(fail)throw Error('private migration details');}},{enabled:true,seller,publicOrigin});
 await assert.rejects(runtime.migrate());const res=response();await runtime.handle({url:'/api/v1/shop/downloads/anything'},res);assert.equal(res.status,503);assert.equal(res.value.code,'SHOP_NOT_READY');assert.equal(JSON.stringify(res.value).includes('private'),false);
 fail=false;queries=0;await Promise.all([runtime.migrate(),runtime.migrate(),runtime.migrate()]);const count=queries;await runtime.migrate();assert.equal(queries,count);assert.ok(count>0);
});
test('real HTTP consent lifecycle recovers a lost acknowledgement without another POST',async()=>{
 const f=await setup();try{
  let posts=0,lose=true;const fetcher=async(url,options)=>{const res=await fetch(f.origin+url,{...options,headers:{...options.headers,...(options.method==='POST'?{Origin:publicOrigin}:{})}});if(options.method==='POST'){posts++;if(lose){lose=false;await res.text();throw Error('connection lost after server commit');}}return res;};
  const client=createDownloadReviewClient({fetcher,getToken:()=> 'owner-a'}),view=await client.readConsent(f.order.id);
  assert.equal((await client.readStatus(f.order.id)).status,'prepared');assert.equal((await client.readReceipt(f.order.id)).recorded,false);
  await assert.rejects(client.acceptConsent(view,{accepted:true}),{code:'REQUEST_UNCERTAIN'});
  await assert.rejects(client.acceptConsent(view,{accepted:true}),{code:'CONSENT_REVIEW_REQUIRED'});assert.equal(posts,1);
  const receipt=await client.readReceipt(f.order.id);assert.equal(receipt.recorded,true);assert.equal(receipt.digest,view.digest);assert.equal(posts,1);
  await f.progress();let status=await client.readStatus(f.order.id);assert.equal(status.paymentMode,'test');assert.equal(status.status,'paid');assert.equal(status.purchaseCompleted,false);assert.equal(status.licence,'blocked');assert.equal(status.invoicePreviewAvailable,false);
  await assert.rejects(client.readInvoicePreview(f.order.id),{code:'INVOICE_NOT_READY'});
  await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();status=await client.readStatus(f.order.id);assert.equal(status.invoicePreviewAvailable,true);assert.equal(status.purchaseCompleted,false);assert.equal(status.canActivate,false);
  const invoice=await client.readInvoicePreview(f.order.id);assert.equal(invoice.kind,'invoice_preview');assert.equal(invoice.invoiceDelivered,false);
  const html=await f.call('invoice-preview.html');assert.equal(html.status,200);assert.equal(html.headers.get('cache-control'),'private, no-store');assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await html.text(),/keine ausgestellte Rechnung/);
  assert.equal((await client.readReceipt(f.order.id)).digest,view.digest);
  assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,1);assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,1);
 }finally{await f.close();}
});
test('HTTP rejects forged origins, methods, shapes, URLs and oversized/invalid UTF-8 bodies',async()=>{
 const f=await setup();try{
  const view=await(await f.call('consent')).json(),body=JSON.stringify({accepted:true,acceptedDigest:view.digest});
  for(const [action,options,status] of [
   ['consent',{method:'POST',headers:{'Content-Type':'application/json'},body},403],
   ['consent',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body},403],
   ['status',{headers:{Origin:'https://evil.test'}},403],
   ['status',{headers:{'Sec-Fetch-Site':'cross-site'}},403],
   ['status',{method:'POST',headers:{Origin:publicOrigin}},405],
   ['consent',{method:'OPTIONS'},405],
   ['status?token=owner-a',{},400],
   ['unknown',{},400],
   ['consent',{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'text/plain'},body},400],
   ['consent',{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({accepted:true,acceptedDigest:view.digest,seller})},400],
   ['consent',{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({accepted:false,acceptedDigest:view.digest})},400],
   ['consent',{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'application/json'},body:' '.repeat(2049)},413],
   ['consent',{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'application/json'},body:Buffer.from([0x7b,0xff,0x7d])},400]
  ]){const res=await f.call(action,options);assert.equal(res.status,status,action+' '+JSON.stringify(options.headers));assert.equal(res.headers.get('access-control-allow-origin'),null);}
  assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,0);
  const method=await f.call('status',{method:'DELETE'});assert.equal(method.headers.get('allow'),'GET');
 }finally{await f.close();}
});
test('all protected resources enforce session/company and hide internal diagnostics',async()=>{
 const f=await setup();try{
  for(const action of ['consent','consent-receipt','status','invoice-preview','invoice-preview.html','invoice-preview.pdf'])for(const [token,status]of [['',401],['owner-b',404],['waiter',403],['expired',401],['inactive',401],['reset',401]]){
   const res=await f.call(action,{headers:{Authorization:token?'Bearer '+token:''}});assert.equal(res.status,status,action+' '+token);const body=await res.json();assert.equal(body.canActivate,false);
   for(const key of ['company_id','provider_payment_id','session_hash','entitlement_id','snapshot'])assert.equal(JSON.stringify(body).includes(key),false);
  }
  const faulty={...f.pool,connect:async()=>{throw Error('postgres password=private-secret');}},runtime=createShopDownloadRuntime(faulty,{enabled:true,seller,publicOrigin});await runtime.migrate();const res=response();await runtime.handle({url:f.path+'status',method:'GET',headers:{authorization:'Bearer owner-a'}},res);assert.equal(res.status,503);assert.equal(res.value.code,'SHOP_UNAVAILABLE');assert.equal(JSON.stringify(res.value).includes('private'),false);
 }finally{await f.close();}
});

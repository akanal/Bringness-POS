import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {PassThrough} from 'node:stream';
import {fixture} from './fixture.mjs';
import {createShopRuntime} from '../../server/shop-http.js';
import {readShopRequestBody} from '../../server/shop-request-body.js';
test('shared shop body limits are validated before stream consumption',()=>{
 for(const maxBytes of [0,-1,16385,1.5,'4096',null])assert.throws(()=>readShopRequestBody(new PassThrough(),{maxBytes}),/INVALID_SHOP_BODY_LIMIT/);
 for(const bodyTimeoutMs of [0,-1,60001,1.5,'15'])assert.throws(()=>createShopRuntime({}, {bodyTimeoutMs}),/INVALID_SHOP_BODY_TIMEOUT/);
});
test('disabled or malformed shop routing performs no reads or database work',async()=>{
 const pool={query(){assert.fail('unexpected database');}};assert.equal(await createShopRuntime(pool).handle({get url(){assert.fail('disabled URL read');}},{}),false);
 assert.equal(await createShopRuntime(pool,{enabled:true}).handle({url:'http://['},{}),false);
});
test('draft and checkout request boundaries preserve recorded business facts',async t=>{
 const f=await fixture(),runtime=createShopRuntime(f.pool,{enabled:true,bodyTimeoutMs:80});await runtime.migrate();
 const server=http.createServer((req,res)=>{runtime.handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}}).catch(e=>res.destroy(e));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/v1/shop/`;
 const call=async(path,raw='{}',headers={})=>{const res=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer owner-a','Content-Type':'application/json',...headers},body:raw});return {status:res.status,headers:res.headers,value:await res.json()};};
 const stalled=path=>new Promise((resolve,reject)=>{const req=http.request(base+path,{method:'POST',headers:{Authorization:'Bearer owner-a','Content-Type':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,value:JSON.parse(text)}));});req.on('error',reject);req.write('{');});
 const facts=async()=>{const out={};for(const table of ['shop_order_drafts','shop_checkout_orders','billing_checkout_guards','billing_transactions','company_entitlements','company_features'])out[table]=(await f.db.query('SELECT * FROM '+table)).rows;return out;};
 try{
 let draft,checkout,before,checkoutBody;
 await t.test('valid request and replay retain original special prices',async()=>{
  const body=JSON.stringify({requestId:crypto.randomUUID(),cart:{'pos-online':1}}),first=await call('drafts',body),replay=await call('drafts',body);assert.equal(first.status,200);assert.equal(replay.value.id,first.value.id);draft=first.value;assert.equal(draft.snapshot.lines[0].netCents,2999);
  const line=draft.snapshot.lines[0];checkoutBody=JSON.stringify({draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:line.netCents,acceptedGrossCents:line.grossCents});const r=await call('checkouts',checkoutBody);assert.equal(r.status,200);checkout=r.value;before=await facts();
 });
 await t.test('invalid UTF8 and non-object JSON are rejected without writes',async()=>{
  for(const raw of [Buffer.from([255]),'[]','null','"text"','{'])assert.equal((await call('drafts',raw)).status,400);assert.deepEqual(await facts(),before);
 });
 await t.test('unsupported encodings and charset parameters are rejected',async()=>{
  for(const headers of [{'Content-Encoding':'gzip'},{'Content-Type':'application/json; charset=latin1'},{'Content-Type':'application/json; arbitrary=1'}])assert.equal((await call('preview','{"cart":{"pos-online":1}}',headers)).status,400);assert.deepEqual(await facts(),before);
 });
 await t.test('declared oversized bodies fail early with no-store response',async()=>{
  const r=await call('drafts','x'.repeat(4097));assert.equal(r.status,413);assert.equal(r.value.code,'BODY_TOO_LARGE');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('connection'),'close');assert.deepEqual(await facts(),before);
 });
 await t.test('chunked multibyte payloads obey actual byte bound',async()=>{
  const res=await new Promise((resolve,reject)=>{const req=http.request(base+'preview',{method:'POST',headers:{Authorization:'Bearer owner-a','Content-Type':'application/json'}},r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>resolve({status:r.statusCode,value:JSON.parse(body)}));});req.on('error',reject);req.write('ü'.repeat(2100));req.end();});assert.equal(res.status,413);assert.deepEqual(await facts(),before);
 });
 await t.test('stalled draft creation has a total deadline and closes connection',async()=>{
  const r=await stalled('drafts');assert.equal(r.status,408);assert.equal(r.value.code,'SHOP_BODY_TIMEOUT');assert.equal(r.headers.connection,'close');assert.equal(r.value.canPay,false);assert.deepEqual(await facts(),before);
 });
 await t.test('stalled checkout creation and both cancellation paths preserve rows',async()=>{
  for(const path of ['checkouts','drafts/'+draft.id+'/cancel','checkouts/'+checkout.id+'/cancel'])assert.equal((await stalled(path)).status,408);assert.deepEqual(await facts(),before);
 });
 await t.test('cross-site metadata and URL fragments fail before processing',async()=>{
  assert.equal((await call('drafts','{}',{'Sec-Fetch-Site':'cross-site'})).status,403);
  const req=new PassThrough();Object.assign(req,{url:'/api/v1/shop/preview#unexpected',method:'POST',headers:{authorization:'Bearer owner-a','content-type':'application/json'}});let status;await runtime.handle(req,{setHeader(){},writeHead(s){status=s;},end(){}});assert.equal(status,400);assert.equal(req.listenerCount('data'),0);req.destroy();assert.deepEqual(await facts(),before);
 });
 await t.test('subsequent explicit checkout replay works without new business writes',async()=>{
  const r=await call('checkouts',checkoutBody,{'Content-Encoding':'IDENTITY','Content-Type':'application/json; charset=utf-8'});assert.equal(r.status,200);assert.equal(r.value.id,checkout.id);assert.equal(r.value.snapshot.netCents,2999);assert.deepEqual(await facts(),before);
 });
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await f.db.close();}
});

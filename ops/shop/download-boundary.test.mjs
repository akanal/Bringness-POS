import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {downloadFixture,seller} from './download-fixture.mjs';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
const publicOrigin='https://fixture.example.test';
test('download body deadlines reject incomplete consent/archive without writes and allow explicit recovery',async t=>{
 const f=await downloadFixture({accept:false,paid:false});
 const runtime=createShopDownloadRuntime(f.pool,{enabled:true,archiveEnabled:true,seller,publicOrigin,bodyTimeoutMs:60});await runtime.migrate();
 const server=http.createServer((req,res)=>runtime.handle(req,res).catch(e=>res.destroy(e)));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/v1/shop/downloads/${f.order.id}/`;
 const headers={Authorization:'Bearer owner-a',Origin:publicOrigin,'Content-Type':'application/json'};
 const call=(action,body,extra={})=>fetch(base+action,{method:'POST',headers:{...headers,...extra},body});
 const count=async()=>(await f.db.query('SELECT * FROM shop_download_invoice_consents')).rows;
 try{
 for(const action of ['consent','archive-invoice-preview'])await t.test(action+' total timeout closes unfinished connection',async()=>{
  const result=await new Promise((resolve,reject)=>{const req=http.request(base+action,{method:'POST',headers},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(raw)}));});req.on('error',reject);req.write('{');});
  assert.equal(result.status,408);assert.equal(result.body.code,'SHOP_BODY_TIMEOUT');assert.equal(result.headers.connection,'close');assert.equal(result.body.canActivate,false);assert.deepEqual(await count(),[]);
 });
 for(const action of ['consent','archive-invoice-preview'])await t.test(action+' rejects unsupported encoding and declared oversized body',async()=>{
  assert.equal((await call(action,'{}',{'Content-Encoding':'gzip'})).status,400);
  assert.equal((await call(action,' '.repeat(action==='consent'?2049:1025))).status,413);assert.deepEqual(await count(),[]);
 });
 await t.test('malformed UTF8 and JSON shapes cannot record consent',async()=>{
  for(const raw of [Buffer.from([255]),'[]','null','{'])assert.equal((await call('consent',raw)).status,400);assert.deepEqual(await count(),[]);
 });
 await t.test('explicit consent after timeout records once and replays identically',async()=>{
  const view=await(await fetch(base+'consent',{headers:{Authorization:'Bearer owner-a'}})).json();
  const raw=JSON.stringify({accepted:true,acceptedDigest:view.digest});
  assert.equal((await call('consent',raw)).status,200);assert.equal((await call('consent',raw)).status,200);assert.equal((await count()).length,1);
 });
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await f.db.close();}
});
test('download timeout options fail before configuration/database work',()=>{
 for(const bodyTimeoutMs of [0,-1,60001,1.5,'15',null])assert.throws(()=>createShopDownloadRuntime({}, {bodyTimeoutMs}),/INVALID_SHOP_BODY_TIMEOUT/);
});

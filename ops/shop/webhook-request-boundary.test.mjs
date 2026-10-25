import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createShopTestWebhook,shopTestWebhookPath} from '../../server/shop-test-webhook.js';
test('disabled TEST callback does not inspect input and invalid deadlines fail early',async()=>{
 assert.equal(await createShopTestWebhook({}).handle({get url(){assert.fail('disabled URL read');}},{}),false);
 for(const bodyTimeoutMs of [0,-1,60001,1.5,'15',null])assert.throws(()=>createShopTestWebhook({},{bodyTimeoutMs}),/INVALID_SHOP_BODY_TIMEOUT/);
 assert.equal(await createShopTestWebhook({},{enabled:true}).handle({url:'http://['},{}),false);
});
test('bounded TEST callback rejects bad bodies without database or provider work',async t=>{
 let queries=0;const receiver=createShopTestWebhook({query(){queries++;throw Error('unexpected database');}},{enabled:true,bodyTimeoutMs:40});
 const server=http.createServer((req,res)=>receiver.handle(req,res).catch(e=>res.destroy(e)));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}${shopTestWebhookPath}`;
 const call=(body,headers={},stall=false)=>new Promise((resolve,reject)=>{
  const req=http.request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,value:JSON.parse(text)}));});req.on('error',reject);if(stall)req.write(body);else req.end(body);
 });
 try{
  await t.test('stalled body expires and closes the unfinished connection',async()=>{const r=await call('id=tr_',{},true);assert.equal(r.status,408);assert.equal(r.headers.connection,'close');assert.deepEqual(r.value,{ok:false});});
  await t.test('declared oversized input fails before queueing',async()=>assert.equal((await call('x'.repeat(1025),{'content-length':'1025'})).status,413));
  await t.test('actual chunked bytes obey the same limit',async()=>assert.equal((await call('x'.repeat(1025),{'transfer-encoding':'chunked'})).status,413));
  await t.test('compressed input is rejected',async()=>assert.equal((await call('id=tr_example',{'content-encoding':'gzip'})).status,400));
  await t.test('invalid UTF8 is rejected',async()=>assert.equal((await call(Buffer.from([255]))).status,400));
  await t.test('duplicate IDs are rejected',async()=>assert.equal((await call('id=tr_first&id=tr_second')).status,400));
  await t.test('later requests remain responsive after timeout',async()=>assert.equal((await call('unknown=value')).status,400));
  assert.equal(queries,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createShopMollieWebhookHandler} from './shop-mollie-webhook-http.js';
const pool={query:async()=>({rows:[]})};
function request(method,contentType,body='id=tr_123'){
 const req=Readable.from([Buffer.from(body)]);req.method=method;req.headers={'content-type':contentType};return req;
}
async function run(handler,req){const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(){this.ended=true;}};await handler(req,res);assert.equal(res.ended,true);return res.statusCode;}
test('handler refuses unconfigured or unthrottled routes',()=>{
 assert.throws(()=>createShopMollieWebhookHandler({pool,fetchProviderPayment:async()=>({})}),/NOT_CONFIGURED/);
 assert.throws(()=>createShopMollieWebhookHandler({pool,fetchProviderPayment:async()=>({}),rateLimiter:async()=>true,maxBytes:Infinity}),/NOT_CONFIGURED/);
});
test('handler validates rate limit, method, content type and body size',async()=>{
 const handler=createShopMollieWebhookHandler({pool,fetchProviderPayment:async()=>({}),rateLimiter:async()=>true,maxBytes:16});
 assert.equal(await run(handler,request('GET','application/x-www-form-urlencoded')),405);
 assert.equal(await run(handler,request('POST','application/json')),415);
 assert.equal(await run(handler,request('POST','application/x-www-form-urlencoded','x'.repeat(20))),413);
 assert.equal(await run(handler,request('POST','application/x-www-form-urlencoded','id=tr_123')),200);
 const denied=createShopMollieWebhookHandler({pool,fetchProviderPayment:async()=>({}),rateLimiter:async()=>false});
 assert.equal(await run(denied,request('POST','application/x-www-form-urlencoded')),429);
 const limiterError=createShopMollieWebhookHandler({pool,fetchProviderPayment:async()=>({}),rateLimiter:async()=>{throw Error('rate limiter down');}});
 assert.equal(await run(limiterError,request('POST','application/x-www-form-urlencoded')),503);
});

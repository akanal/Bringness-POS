import {registrationMetadataQuery} from './registration-schema-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Readable} from 'node:stream';
import {createShopRegistrationRuntime} from '../../server/shop-registration-http.js';
import {requestShopRegistration} from '../../apps/web/public/shop/registration-client.js';
const origin='https://fixture.example.test',path='/api/v1/shop/registrations';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.value=JSON.parse(body);}};}
function request(stream=Readable.from(['{}']),headers={}){return Object.assign(stream,{url:path,method:'POST',headers:{origin,'content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});}
async function setup(options={}){let admits=0;const runtime=createShopRegistrationRuntime({query:registrationMetadataQuery,async connect(){assert.fail('invalid requests must not reach database');}},{enabled:true,publicOrigin:origin,limiter:{admit(){admits++;return {allowed:true};}},...options});await runtime.migrate();return {runtime,admits:()=>admits};}
async function send(runtime,headers={}){const res=response();assert.equal(await runtime.handle(request(undefined,headers),res),true);return res;}
test('registration capacity accepts only bounded integer configuration',()=>{
 for(const maxConcurrent of [0,-1,9,1.5,NaN,Infinity,'2',null])assert.throws(()=>createShopRegistrationRuntime({}, {maxConcurrent}),/INVALID_REGISTRATION_CAPACITY/);
 for(const maxConcurrent of [1,2,8])assert.doesNotThrow(()=>createShopRegistrationRuntime({}, {maxConcurrent}));
});
test('default capacity bounds two simultaneous request bodies without queueing or admission consumption',async()=>{
 const {runtime,admits}=await setup(),a=new PassThrough(),b=new PassThrough(),ra=response(),rb=response();const first=runtime.handle(request(a),ra),second=runtime.handle(request(b),rb);
 try{const busy=await send(runtime);assert.equal(busy.status,503);assert.deepEqual(busy.value,{code:'REGISTRATION_BUSY'});assert.equal(admits(),2);assert.equal(busy.headers['Cache-Control'],'no-store');assert.equal(busy.headers['X-Content-Type-Options'],'nosniff');assert.equal(busy.headers['Retry-After'],undefined);}finally{a.end('{}');b.end('{}');await Promise.all([first,second]);}
 assert.equal((await send(runtime)).status,400);assert.equal(admits(),3);
});
test('capacity is local to the registration runtime and releases after malformed JSON',async()=>{
 const a=await setup({maxConcurrent:1}),b=await setup({maxConcurrent:1}),stream=new PassThrough(),res=response(),pending=a.runtime.handle(request(stream),res);
 try{assert.equal((await send(a.runtime)).status,503);assert.equal((await send(b.runtime)).status,400);}finally{stream.end('{');await pending;}
 assert.equal(res.status,400);assert.equal((await send(a.runtime)).status,400);
});
test('stream failure releases capacity and strips private diagnostics',async()=>{
 const {runtime}=await setup({maxConcurrent:1}),stream=new PassThrough(),res=response(),pending=runtime.handle(request(stream),res);stream.destroy(Error('private payload'));
 await pending;assert.equal(res.status,400);assert.deepEqual(res.value,{code:'INVALID_BODY'});assert.equal((await send(runtime)).status,400);
});
test('an already aborted body releases capacity without database work',async()=>{
 const {runtime}=await setup({maxConcurrent:1}),req=request();req.aborted=true;const res=response();await runtime.handle(req,res);assert.equal(res.status,400);assert.equal((await send(runtime)).status,400);
});
test('unsupported compressed bodies are refused before admission or body consumption',async()=>{
 const {runtime,admits}=await setup();for(const encoding of ['gzip','br','deflate','identity, gzip']){const stream=new PassThrough(),res=response();await runtime.handle(request(stream,{'content-encoding':encoding}),res);assert.equal(res.status,415);assert.deepEqual(res.value,{code:'INVALID_REGISTRATION'});assert.equal(stream.readableFlowing,null);stream.destroy();}assert.equal(admits(),0);
 assert.equal((await send(runtime,{'content-encoding':'identity'})).status,400);assert.equal(admits(),1);assert.equal((await send(runtime,{'content-encoding':'IDENTITY'})).status,400);assert.equal(admits(),2);
});
test('declared oversized body is refused before admission and stream reads',async()=>{
 const {runtime,admits}=await setup(),stream=new PassThrough(),res=response();await runtime.handle(request(stream,{'content-length':'16385'}),res);assert.equal(res.status,413);assert.equal(stream.readableFlowing,null);assert.equal(admits(),0);stream.destroy();
});
test('malformed or unsafe declared lengths cannot enter registration processing',async()=>{
 const {runtime,admits}=await setup();for(const length of ['-1','1.5','1e3','Infinity','9007199254740992','', ['2']])assert.equal((await send(runtime,{'content-length':length})).status,400);assert.equal(admits(),0);assert.equal((await send(runtime,{'content-length':'2'})).status,400);assert.equal(admits(),1);
});
test('stream byte limit still rejects oversized chunked bodies and releases capacity',async()=>{
 const {runtime}=await setup({maxConcurrent:1}),res=response();await runtime.handle(request(Readable.from(['x'.repeat(16385)])),res);assert.equal(res.status,413);assert.equal((await send(runtime)).status,400);
});
test('busy client response remains explicit, sanitized and never automatically retries',async()=>{
 let calls=0;await assert.rejects(requestShopRegistration({requestId:'11111111-1111-4111-8111-111111111111',registration:{},fetcher:async()=>{calls++;return Response.json({code:'REGISTRATION_BUSY',password:'private'},{status:503,headers:{'Retry-After':'5'}});}}),e=>e.code==='REGISTRATION_BUSY'&&!e.message.includes('private')&&e.retryAfter===undefined);assert.equal(calls,1);
});

test('database connection failure releases the slot after password derivation',async()=>{
 let connects=0;const runtime=createShopRegistrationRuntime({query:registrationMetadataQuery,async connect(){connects++;throw Error('private database credentials');}},{enabled:true,publicOrigin:origin,maxConcurrent:1,limiter:{admit:()=>({allowed:true})}});await runtime.migrate();
 const registration={companyName:'Fixture Firm',ownerName:'Fixture Owner',email:'fixture@example.test',password:'Valid1!',street:'Example 1',postalCode:'00123',city:'Berlin',country:'DE'},body=JSON.stringify({requestId:'11111111-1111-4111-8111-111111111111',registration});
 for(let i=0;i<2;i++){const res=response();await runtime.handle(request(Readable.from([body])),res);assert.equal(res.status,503);assert.deepEqual(res.value,{code:'REGISTRATION_UNAVAILABLE'});}assert.equal(connects,2);
});
test('rate refusal does not consume a concurrent processing slot',async()=>{
 let allowed=false;const {runtime}=await setup({maxConcurrent:1,limiter:{admit:()=>({allowed,retryAfter:1})}});assert.equal((await send(runtime)).status,429);allowed=true;assert.equal((await send(runtime)).status,400);
});

import {registrationMetadataQuery} from './registration-schema-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Readable} from 'node:stream';
import http from 'node:http';
import {readRegistrationBody} from '../../server/shop-registration-body.js';
import {createShopRegistrationRuntime} from '../../server/shop-registration-http.js';
import {requestShopRegistration} from '../../apps/web/public/shop/registration-client.js';
const origin='https://fixture.example.test';
const options={timeoutMs:30};
test('body deadline rejects stalled stream and removes all readers',async()=>{
 const req=new PassThrough();await assert.rejects(readRegistrationBody(req,options),{code:'REGISTRATION_BODY_TIMEOUT'});
 for(const event of ['data','end','aborted','error','close'])assert.equal(req.listenerCount(event),0);assert.equal(req.readableFlowing,false);req.destroy();
});
test('trickling bytes cannot extend total deadline',async()=>{
 const req=new PassThrough(),pending=readRegistrationBody(req,{timeoutMs:60}),tick=setInterval(()=>req.write(' '),5);
 try{await assert.rejects(pending,{code:'REGISTRATION_BODY_TIMEOUT'});}finally{clearInterval(tick);req.destroy();}
});
test('completed JSON is returned without waiting for deadline',async()=>{
 assert.deepEqual(await readRegistrationBody(Readable.from(['{"value":','1}']),options),{value:1});
});
test('invalid UTF8 and non-object JSON fail closed',async()=>{
 for(const bytes of [Buffer.from([255]),'[]','null','"text"','{'])await assert.rejects(readRegistrationBody(Readable.from([bytes]),options),{code:'INVALID_BODY'});
});
test('actual byte bound works with multibyte chunks',async()=>{
 await assert.rejects(readRegistrationBody(Readable.from(['ü'.repeat(9000)]),options),{code:'BODY_TOO_LARGE'});
});
test('aborted, destroyed and prematurely closed streams terminate',async()=>{
 const aborted=new PassThrough();aborted.aborted=true;await assert.rejects(readRegistrationBody(aborted,options),{code:'INVALID_BODY'});aborted.destroy();
 const closed=new PassThrough(),pending=readRegistrationBody(closed,options);closed.destroy();await assert.rejects(pending,{code:'INVALID_BODY'});
});
test('invalid deadline settings are rejected before reading',()=>{
 for(const timeoutMs of [0,-1,60001,1.5,NaN,Infinity,'10',null])assert.throws(()=>readRegistrationBody(new PassThrough(),{timeoutMs}),/INVALID_REGISTRATION_BODY_TIMEOUT/);
 for(const bodyTimeoutMs of [0,-1,60001,1.5,'10'])assert.throws(()=>createShopRegistrationRuntime({}, {bodyTimeoutMs}),/INVALID_REGISTRATION_BODY_TIMEOUT/);
});
test('stream errors expose no private diagnostics',async()=>{
 const req=new PassThrough(),pending=readRegistrationBody(req,options);req.destroy(Error('private password'));await assert.rejects(pending,e=>e.code==='INVALID_BODY'&&!e.message.includes('private'));
});
test('real HTTP stalled body returns 408, closes connection and releases capacity',async()=>{
 const runtime=createShopRegistrationRuntime({query:registrationMetadataQuery,async connect(){assert.fail('must not enter database');}},{enabled:true,publicOrigin:origin,bodyTimeoutMs:40,maxConcurrent:1,limiter:{admit:()=>({allowed:true})}});await runtime.migrate();
 const server=http.createServer((req,res)=>{runtime.handle(req,res).catch(e=>{res.destroy(e);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const send=body=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/v1/shop/registrations',method:'POST',headers:{origin,'content-type':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,value:JSON.parse(text)}));});req.on('error',reject);req.flushHeaders();if(body===undefined)req.write('{');else req.end(body);});
 try{const response=await send();assert.equal(response.status,408);assert.equal(response.headers.connection,'close');assert.equal(response.headers['cache-control'],'no-store');assert.deepEqual(response.value,{code:'REGISTRATION_BODY_TIMEOUT'});assert.equal((await send('{}')).status,400);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('client timeout response remains explicit with no automatic retry',async()=>{
 let calls=0;await assert.rejects(requestShopRegistration({requestId:'11111111-1111-4111-8111-111111111111',registration:{},fetcher:async()=>{calls++;return Response.json({code:'REGISTRATION_BODY_TIMEOUT',private:'hidden'},{status:408});}}),e=>e.code==='REGISTRATION_BODY_TIMEOUT'&&!e.message.includes('hidden'));assert.equal(calls,1);
});

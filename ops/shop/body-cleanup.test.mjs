import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {readShopRequestBody} from '../../server/shop-request-body.js';
const events=['data','end','aborted','error','close'];
for(const mode of ['success','invalid','oversize','aborted','close','timeout'])test('shared body reader releases listeners after '+mode,async()=>{
 const req=new PassThrough(),baseline=events.map(e=>req.listenerCount(e));
 const result=readShopRequestBody(req,{timeoutMs:20,maxBytes:8});
 if(mode==='success')req.end('{}');
 if(mode==='invalid')req.end('[]');
 if(mode==='oversize')req.end('123456789');
 if(mode==='aborted')req.emit('aborted');
 if(mode==='close')req.emit('close');
 if(mode==='success')assert.deepEqual(await result,{});else await assert.rejects(result,{code:mode==='timeout'?'SHOP_BODY_TIMEOUT':mode==='oversize'?'BODY_TOO_LARGE':'INVALID_BODY'});
 assert.deepEqual(events.map(e=>req.listenerCount(e)),baseline);req.destroy();
});
test('already ended streams fail immediately rather than occupying a deadline',async()=>{
 const req=new PassThrough();req.resume();req.end('{}');await new Promise(r=>req.once('end',r));
 await assert.rejects(readShopRequestBody(req),{code:'INVALID_BODY'});assert.equal(req.listenerCount('data'),0);
});
test('split UTF8 characters remain valid across chunks',async()=>{
 const req=new PassThrough(),result=readShopRequestBody(req);const bytes=Buffer.from('{"x":"ü"}');req.write(bytes.subarray(0,7));req.end(bytes.subarray(7));assert.deepEqual(await result,{x:'ü'});
});

test('raw body reader preserves form bytes and releases its listeners',async()=>{
 const {readShopRequestBytes}=await import('../../server/shop-request-body.js');
 const req=new PassThrough(),result=readShopRequestBytes(req,{maxBytes:20});req.end('id=tr_example');
 assert.equal((await result).toString(),'id=tr_example');assert.deepEqual(events.map(e=>req.listenerCount(e)),[0,0,0,0,0]);
});
test('raw body deadline releases listeners and rejects without decoding',async()=>{
 const {readShopRequestBytes}=await import('../../server/shop-request-body.js');
 const req=new PassThrough(),result=readShopRequestBytes(req,{timeoutMs:15});req.write(Buffer.from([255]));
 await assert.rejects(result,{code:'SHOP_BODY_TIMEOUT'});assert.deepEqual(events.map(e=>req.listenerCount(e)),[0,0,0,0,0]);req.destroy();
});
test('invalid stream interface rejects before scheduling a deadline',async()=>{
 await assert.rejects(readShopRequestBody({}),{code:'INVALID_BODY'});
});

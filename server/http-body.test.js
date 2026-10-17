import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Readable} from 'node:stream';
import {readRequestBytes,readJsonObject} from './http-body.js';
test('JSON object parser preserves split UTF-8 and counts bytes rather than characters',async()=>{
 const data=Buffer.from('{"name":"🍊Küche"}');
 const parts=[data.subarray(0,11),data.subarray(11,13),data.subarray(13)];
 assert.deepEqual(await readJsonObject(Readable.from(parts),{maxBytes:data.length}),{name:'🍊Küche'});
 await assert.rejects(readJsonObject(Readable.from(parts),{maxBytes:data.length-1}),e=>e.status===413);
 assert.deepEqual(await readJsonObject(Readable.from([])),{});
});
test('JSON parser rejects scalar/null/array, malformed UTF-8, aborted input and stream errors safely',async()=>{
 for(const raw of ['null','[]','"text"','42','true','{bad',Buffer.from([0xff])])await assert.rejects(readJsonObject(Readable.from([raw])),e=>e.status===400&&!e.message.includes('secret'));
 const aborted=Readable.from(['{}']);aborted.aborted=true;await assert.rejects(readJsonObject(aborted),e=>e.status===400);
 await assert.rejects(readJsonObject(Readable.from((async function*(){yield '{';throw Error('secret transport details');})())),e=>e.status===400&&!e.message.includes('secret'));
});
test('oversized HTTP input returns a usable 413 response without reading or storing the whole body',async()=>{
 const server=http.createServer(async(req,res)=>{try{await readJsonObject(req,{maxBytes:8});res.end('unexpected');}catch(e){res.writeHead(e.status,{'connection':'close'});res.end('bounded');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:'{"value":"'+'x'.repeat(100000)+'"}'});assert.equal(response.status,413);assert.equal(await response.text(),'bounded');}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('binary reader preserves exact bytes and validates its configured limit',async()=>{
 const data=Buffer.from([0,255,7]);assert.deepEqual(await readRequestBytes(Readable.from([data]),{maxBytes:3}),data);
 await assert.rejects(readRequestBytes(Readable.from([data]),{maxBytes:0}),TypeError);
});

test('legacy event-stream adapters receive the same bounded and cleaned-up body handling',async()=>{
 const {EventEmitter}=await import('node:events');
 for(const [data,status] of [['{"ok":true}',null],['x'.repeat(33),413]]){
  const req=new EventEmitter();req.resume=()=>{};const pending=readRequestBytes(req,{maxBytes:32});
  if(status){const failure=assert.rejects(pending,e=>e.status===status);req.emit('data',Buffer.from(data));await failure;}
  else{req.emit('data',Buffer.from(data));req.emit('end');assert.equal((await pending).toString(),data);}
  for(const name of ['data','end','aborted','error'])assert.equal(req.listenerCount(name),0);
 }
});

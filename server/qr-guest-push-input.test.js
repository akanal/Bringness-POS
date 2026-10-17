import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createQrGuestPush} from './qr-guest-push.js';
test('guest notification input rejects non-object and oversized payloads before database access',async()=>{
 const api=createQrGuestPush({query:async()=>assert.fail('invalid input reached database')});
 for(const raw of ['null','[]','true','{bad','x'.repeat(8193)]){
  const req=Readable.from([Buffer.from(raw)]);Object.assign(req,{url:'/api/v1/guest/collection-push',method:'POST',headers:{}});let status;
  assert.equal(await api.handle(req,{writeHead(code){status=code;},end(){}}),true);assert.equal(status,raw.length>8192?413:400);
 }
});

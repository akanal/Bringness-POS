import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createRemoteSupport} from './remote-support-core.js';
test('invalid remote assistance objects fail before cleanup, frames or commands can mutate',async()=>{
 for(const raw of ['null','[]','42','{bad','x'.repeat(250001)]){
  let queries=0;const handle=createRemoteSupport({query:async()=>{queries++;if(queries>1)assert.fail('invalid body reached mutations');return {rows:[{id:'owner',platform_admin:true}]};}});
  const req=Readable.from([Buffer.from(raw)]);Object.assign(req,{url:'/api/v1/remote-support/request',method:'POST',headers:{authorization:'Bearer owner'}});let status;
  await handle(req,{writeHead(code){status=code;},end(){}});assert.equal(status,raw.length>250000?413:400);assert.equal(queries,1);
 }
});

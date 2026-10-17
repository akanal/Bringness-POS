import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {createFiskalyTest} from './fiskaly-test.js';
test('Fiskaly credential requests reject invalid UTF8 and oversized JSON before storage/provider calls',async()=>{
 for(const [body,expected] of [[Buffer.from([0xc3,0x28]),400],['null',400],['x'.repeat(8193),413]]){
  let reads=0;const handler=createFiskalyTest({query:async sql=>{reads++;assert.match(sql,/FROM sessions/);return {rows:[{id:'owner',company_id:'company',role:'owner'}]};}},{fetcher(){throw Error('Unexpected provider');}});
  const req=Readable.from([body]);Object.assign(req,{url:'/api/v1/fiskaly-test',method:'PUT',headers:{authorization:'Bearer fixture'}});let status;await handler(req,{writeHead(s){status=s;},end(){}});assert.equal(status,expected);assert.equal(reads,1);
 }
});

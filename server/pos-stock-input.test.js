import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createPosStockHandler} from './pos-stock-bridge-core.js';
test('stock action rejects malformed objects before acquiring a write connection',async()=>{
 const handler=createPosStockHandler({query:async()=>({rows:[{id:'owner',company_id:'company',role:'owner'}]}),connect(){throw Error('Unexpected mutation');}});
 for(const [body,expected] of [['null',400],['[]',400],['{',400],['"scalar"',400],['x'.repeat(4097),413]]){
  const req=Readable.from([body]);Object.assign(req,{url:'/api/v1/orders/11111111-1111-4111-8111-111111111111/status',method:'PATCH',headers:{authorization:'Bearer fixture'}});let status;
  await handler(req,{writeHead(code){status=code;},end(){}});assert.equal(status,expected);
 }
});

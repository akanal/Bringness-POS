import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {fixture} from './fixture.mjs';
import {assertEmptyShopRequest} from '../../server/shop-request-body.js';
import {createShopRuntime} from '../../server/shop-http.js';
for(const headers of [{},{'content-length':'0'}])test('empty read framing is accepted '+JSON.stringify(headers),()=>assert.doesNotThrow(()=>assertEmptyShopRequest({headers})));
for(const headers of [{'content-length':'1'},{'content-length':'00'},{'content-length':0},{'content-length':['0']},{'transfer-encoding':'chunked'},{'transfer-encoding':''},{'content-length':'0','transfer-encoding':'chunked'}])test('ambiguous or nonempty read framing is rejected '+JSON.stringify(headers),()=>assert.throws(()=>assertEmptyShopRequest({headers}),{code:'INVALID_REQUEST'}));
test('all shop GET families reject bodies before account lookup and close unfinished input',async()=>{
 const f=await fixture(),runtime=createShopRuntime(f.pool,{enabled:true});await runtime.migrate();
 let reads=0;const query=f.pool.query;f.pool.query=(...args)=>{reads++;return query(...args);};
 try{for(const path of ['licenses','drafts/history','drafts/active','drafts/requests/00000000-0000-4000-8000-000000000001','drafts/00000000-0000-4000-8000-000000000001','checkouts/history','checkouts/drafts/00000000-0000-4000-8000-000000000001','checkouts/00000000-0000-4000-8000-000000000001']){
  const req=new PassThrough();Object.assign(req,{method:'GET',url:'/api/v1/shop/'+path,headers:{authorization:'Bearer owner-a','content-length':'2'}});let status,value,close,finish;
  const handled=await runtime.handle(req,{setHeader(k,v){if(k==='Connection')close=v;},once(event,fn){assert.equal(event,'finish');finish=fn;},writeHead(s){status=s;},end(text){value=JSON.parse(text);}});
  assert.equal(handled,true,path);assert.equal(status,400,path);assert.equal(value.code,'INVALID_REQUEST',path);assert.equal(close,'close');assert.equal(reads,0);assert.equal(req.listenerCount('data'),0);finish();assert.equal(req.destroyed,true);
 }}finally{await f.db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createCenterHandler} from './center-core.js';
import {createQrService} from './qr-service-core.js';

const centerCode='a'.repeat(48),restaurantCode='b'.repeat(48);
const rows=(...values)=>({rows:values,rowCount:values.length});
async function call(handler,pool,url){
 const req=Readable.from([]);req.url=url;req.method='GET';req.headers={};
 const res={writeHead(status){this.status=status},end(raw){this.body=JSON.parse(raw)}};
 assert.equal(await handler(pool)(req,res),true);
 return res;
}
test('restaurant guest QR endpoint rejects a center-only token',async()=>{
 const pool={async query(sql,args){
  assert.match(sql,/FROM dining_tables t JOIN restaurants r/);
  assert.deepEqual(args,[centerCode]);
  return rows();
 }};
 const res=await call(createQrService,pool,'/api/v1/guest/service-mode?code='+centerCode);
 assert.equal(res.status,404);
 assert.equal(res.body.error,'QR-Code ungültig');
});
test('center guest QR endpoint rejects a restaurant-only token',async()=>{
 const pool={async query(sql,args){
  assert.match(sql,/FROM center_tables t JOIN centers c/);
  assert.deepEqual(args,[restaurantCode]);
  return rows();
 }};
 const res=await call(createCenterHandler,pool,'/api/v1/guest/center/restaurants?code='+restaurantCode);
 assert.equal(res.status,404);
 assert.equal(res.body.error,'Center-Code ungültig');
});
test('center guest QR endpoint resolves center token only in center table storage',async()=>{
 const pool={async query(sql,args){
  if(sql.includes('FROM center_tables t JOIN centers c')){
   assert.deepEqual(args,[centerCode]);
   return rows({id:'table',name:'Center Tisch',center_id:'center',center_name:'Center'});
  }
  assert.match(sql,/FROM center_restaurants cr JOIN restaurants r/);
  assert.deepEqual(args,['center']);
  return rows();
 }};
 const res=await call(createCenterHandler,pool,'/api/v1/guest/center/restaurants?code='+centerCode);
 assert.equal(res.status,200);
 assert.equal(res.body.center,'Center');
});

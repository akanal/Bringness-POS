import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {handleRestaurantOwnerFeature} from './restaurant-owner-features.js';
const rid='11111111-1111-4111-8111-111111111111';
export async function call(path,{body='',method='GET',actor={role:'owner',id:rid,company_id:rid},query}={}){
 const calls=[];const db={query:async(sql,args)=>{calls.push(sql);return query?query(sql,args):{rows:sql.includes('FROM sessions')?[actor]:[{id:rid}],rowCount:1};},connect(){throw Error('Unexpected mutation');}};
 const req=Readable.from(body?[body]:[]);Object.assign(req,{url:path,method,headers:{authorization:'Bearer fixture'}});let status,data;
 const handled=await handleRestaurantOwnerFeature(req,{writeHead(s){status=s;},end(s){data=JSON.parse(s);}},{db});return {status,data,handled,calls};
}
test('owner guest order rejects invalid bounded bodies before database work',async()=>{
 for(const [body,status] of [['null',400],['[]',400],['{',400],['x'.repeat(65537),413]])await assert.rejects(call('/api/v1/guest/order-v2',{method:'POST',body}),e=>e.status===status);
});

test('owner and receipt APIs exclude password-gated sessions',async()=>{
 const r=await call('/api/v1/products/'+rid+'/extras',{query:async sql=>{assert.match(sql,/must_change_password/);return {rows:[],rowCount:0};}});assert.equal(r.status,401);assert.equal(r.calls.length,1);
});

test('table details reject unassigned waiters before returning guest/order data',async()=>{
 const actor={id:rid,company_id:rid,role:'waiter'};let orderRead=false;
 const r=await call('/api/v1/tables/'+rid+'/details',{actor,query:async sql=>{
  if(sql.includes('FROM sessions'))return {rows:[actor],rowCount:1};
  if(sql.includes('FROM employees'))return {rows:[],rowCount:0};
  if(sql.includes('SELECT t.*'))return {rows:[{id:rid,restaurant_id:rid,waiter_employee_ids:[]}],rowCount:1};
  orderRead=true;throw Error('Unexpected private order read');
 }});assert.equal(r.status,403);assert.equal(orderRead,false);
});

test('legacy handset presence cannot bypass personal POS stamping',async()=>{
 for(const action of ['start','end']){const r=await call('/api/v1/waiter/presence/'+action,{method:'POST',actor:{id:rid,company_id:rid,role:'waiter'}});assert.equal(r.status,410);assert.equal(r.calls.length,1);}
});

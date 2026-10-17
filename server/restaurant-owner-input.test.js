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

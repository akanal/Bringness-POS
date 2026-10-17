import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createTableSettlement} from './table-settlement.js';
const id='11111111-1111-4111-8111-111111111111';
const valid=()=>({requestKey:id,tableId:id,orderIds:[id],expectedTotalCents:100,paymentMethod:'cash'});
async function run(body,{auth='Bearer fixture',raw,actor}={}){
 const calls=[];const db={connect:async()=>({query:async(sql)=>{calls.push(sql);if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};if(sql.includes('FROM sessions'))return {rows:actor?[actor]:[]};throw Error('Unexpected write');},release(){}})};
 const req=Readable.from([Buffer.from(raw??JSON.stringify(body))]);Object.assign(req,{url:'/api/v1/tables/settle',method:'POST',headers:{authorization:auth}});
 const response={writeHead(status){this.status=status;},end(raw){this.body=JSON.parse(raw);}};
 await createTableSettlement(db)(req,response);return {response,calls};
}
test('table card confirmation flags cannot create a payment',async()=>{const {response,calls}=await run({...valid(),paymentMethod:'card',externalCardConfirmed:true});assert.equal(response.status,409);assert.equal(calls.length,0);});
test('invalid table settlement identifiers are refused before any transaction',async()=>{
 for(const patch of [{requestKey:null},{requestKey:{}},{tableId:42},{tableId:'bad'},{orderIds:[]},{orderIds:[id,id.toUpperCase()]},{orderIds:[{}]},{expectedTotalCents:0},{expectedTotalCents:1.5},{expectedTotalCents:2147483648}]){
  const {response,calls}=await run({...valid(),...patch});assert.equal(response.status,400);assert.equal(calls.length,0);
 }
});
test('malformed and oversized table requests cannot write',async()=>{
 assert.equal((await run(null,{raw:'{'})).response.status,400);
 const result=await run({...valid(),note:'ä'.repeat(40000)});assert.equal(result.response.status,413);assert.equal(result.calls.length,0);
});
test('missing and expired table sessions cannot settle a table',async()=>{
 const missing=await run(valid(),{auth:''});assert.equal(missing.response.status,401);assert.equal(missing.calls.length,0);
 const expired=await run(valid());assert.equal(expired.response.status,401);assert.deepEqual(expired.calls.map(s=>s==='ROLLBACK'?'rollback':s==='BEGIN'?'begin':'auth'),['begin','auth','rollback']);
});
test('waiter role cannot use table settlement',async()=>{
 const result=await run(valid(),{actor:{id,company_id:id,role:'waiter'}});assert.equal(result.response.status,403);assert.equal(result.calls.length,3);
});

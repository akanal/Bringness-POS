import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {supplierAccountRoutes} from './ai-suppliers.js';
const id='11111111-1111-4111-8111-111111111111';
test('supplier connector mutations require a currently active locked supplier and roll back before exposing keys',async()=>{
 const original=pg.Pool.prototype.connect,env={DATABASE_URL:process.env.DATABASE_URL,AI_DB_PASSWORD:process.env.AI_DB_PASSWORD};process.env.DATABASE_URL='postgres://fixture:fixture@localhost/pos_fixture';process.env.AI_DB_PASSWORD='fixture';
 try{for(const [path,body] of [['supplier-connectors',{name:'Fixture'}],['supplier-connector-key',{id}],['supplier-connector-status',{id,active:true}]]){
 const calls=[];pg.Pool.prototype.connect=async()=>({release(){},query:async sql=>{calls.push(sql);return {rows:[]};}});
 await assert.rejects(supplierAccountRoutes('/api/ai/'+path,'POST',body,{id,role:'dealer'}),e=>e.status===403);assert.equal(calls.at(-1),'ROLLBACK');assert(!calls.some(q=>q.includes('INSERT')||q.startsWith('UPDATE')));
 }}finally{pg.Pool.prototype.connect=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

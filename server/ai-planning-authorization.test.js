import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {planningRoutes} from './ai-planning.js';
const id='11111111-1111-4111-8111-111111111111';
test('delegated purchasing permission cannot survive a failed audit or revoked owner',async()=>{
 const env={DATABASE_URL:process.env.DATABASE_URL,AI_DB_PASSWORD:process.env.AI_DB_PASSWORD};process.env.DATABASE_URL='postgres://fixture:fixture@localhost/pos_fixture';process.env.AI_DB_PASSWORD='fixture';const original=pg.Pool.prototype.connect;
 try{for(const active of [false,true]){const calls=[];pg.Pool.prototype.connect=async()=>({release(){},query:async sql=>{calls.push(sql);if(sql.includes('INSERT INTO ai_audit'))throw Error('Audit unavailable');return {rows:sql.includes('ai_accounts')?[...(active?[{id:sql.includes('lower(email)')?'22222222-2222-4222-8222-222222222222':id}]:[])]:[{id}],rowCount:1};}});
 await assert.rejects(planningRoutes('/api/ai/purchase-delegates','POST',{locationId:id,email:'delegate@example.test',active:true},{id,role:'restaurant'}));assert.equal(calls.at(-1),'ROLLBACK');assert(!calls.includes('COMMIT'));if(!active)assert(!calls.some(q=>q.startsWith('INSERT')));
 }}finally{pg.Pool.prototype.connect=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

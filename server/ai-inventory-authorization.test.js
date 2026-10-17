import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {inventoryRoutes} from './ai-inventory.js';
const id='11111111-1111-4111-8111-111111111111';
test('inventory writes recheck account revocation before replaying or changing quantities',async()=>{
 const env={DATABASE_URL:process.env.DATABASE_URL,AI_DB_PASSWORD:process.env.AI_DB_PASSWORD};process.env.DATABASE_URL='postgres://fixture:fixture@localhost/pos_fixture';process.env.AI_DB_PASSWORD='fixture';const original=pg.Pool.prototype.connect;const calls=[];try{pg.Pool.prototype.connect=async()=>({release(){},query:async sql=>{calls.push(sql);return {rows:[]};}});
 await assert.rejects(inventoryRoutes('/api/ai/inventory/count','POST',{requestKey:id,confirmed:true,reason:'Fixture count',lines:[{stockId:id,expectedQuantity:0,countedQuantity:1}]},{id,role:'restaurant'},new URL('http://local')),e=>e.status===403);
 assert(calls.some(sql=>sql.includes("status='active'")));assert.equal(calls.at(-1),'ROLLBACK');assert(!calls.some(sql=>sql.includes('ai_inventory_requests')));
 }finally{pg.Pool.prototype.connect=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

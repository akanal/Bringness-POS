import {deliveryRoutes} from './ai-delivery-notes.js';
import {barcodeRoutes} from './ai-barcodes.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {inventoryRoutes} from './ai-inventory.js';
const id='11111111-1111-4111-8111-111111111111';
test('inventory writes recheck account revocation before replaying or changing quantities',async()=>{
 const env={DATABASE_URL:process.env.DATABASE_URL,AI_DB_PASSWORD:process.env.AI_DB_PASSWORD};process.env.DATABASE_URL='postgres://fixture:fixture@localhost/pos_fixture';process.env.AI_DB_PASSWORD='fixture';const original=pg.Pool.prototype.connect;const calls=[];try{pg.Pool.prototype.connect=async()=>({release(){},query:async sql=>{calls.push(sql);return {rows:[]};}});
 await assert.rejects(inventoryRoutes('/api/ai/inventory/count','POST',{requestKey:id,confirmed:true,reason:'Fixture count',lines:[{stockId:id,expectedQuantity:0,countedQuantity:1}]},{id,role:'restaurant'},new URL('http://local')),e=>e.status===403);
 assert(calls.some(sql=>sql.includes("status='active'")));assert.equal(calls.at(-1),'ROLLBACK');assert(!calls.some(sql=>sql.includes('ai_inventory_requests')));
 }finally{pg.Pool.prototype.connect=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('barcode receipts recheck suspended restaurants before any replay or stock movement',async()=>{
 const env={DATABASE_URL:process.env.DATABASE_URL,AI_DB_PASSWORD:process.env.AI_DB_PASSWORD};process.env.DATABASE_URL='postgres://fixture:fixture@localhost/pos_fixture';process.env.AI_DB_PASSWORD='fixture';const original=pg.Pool.prototype.connect;const calls=[];
 try{pg.Pool.prototype.connect=async()=>({release(){},query:async sql=>{calls.push(sql);return {rows:[]};}});
 await assert.rejects(barcodeRoutes('/api/ai/barcodes/receive','POST',{entryId:id,locationId:id,requestKey:id,packs:1,confirmed:true},{id,role:'restaurant'}),e=>e.status===403);assert(!calls.some(q=>q.includes('ai_barcode_receipts')));assert.equal(calls.at(-1),'ROLLBACK');
 }finally{pg.Pool.prototype.connect=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('suspended restaurant cannot change historical delivery invoice prices',async()=>{
 const env={DATABASE_URL:process.env.DATABASE_URL,AI_DB_PASSWORD:process.env.AI_DB_PASSWORD};process.env.DATABASE_URL='postgres://fixture:fixture@localhost/pos_fixture';process.env.AI_DB_PASSWORD='fixture';const original=pg.Pool.prototype.connect;const calls=[];
 try{pg.Pool.prototype.connect=async()=>({release(){},query:async sql=>{calls.push(sql);return {rows:[]};}});
 await assert.rejects(deliveryRoutes('/api/ai/delivery-notes/prices','POST',{id,confirmed:true,lines:[{id:'1',netCents:100}]},{id,role:'restaurant'}),e=>e.status===403);assert.equal(calls.at(-1),'ROLLBACK');assert(!calls.some(q=>q.includes('ai_delivery_notes')||q.startsWith('UPDATE')));
 }finally{pg.Pool.prototype.connect=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

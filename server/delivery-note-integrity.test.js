import {test} from 'node:test';import assert from 'node:assert/strict';import {confirmNote} from './ai-delivery-notes.js';
const id='11111111-1111-4111-8111-111111111111';
const body={id,confirmed:true,allPositionsReviewed:true,externalDelivery:true,supplier:'Fixture',reference:'LS-1',deliveryDate:'2026-10-17',lines:[{stockId:id,quantity:600000,unit:'kg',reviewed:true},{stockId:id,quantity:600000,unit:'kg',reviewed:true}]};
test('delivery confirmation caps the combined quantity for repeated ingredients before any stock write',async()=>{
 let rolledBack=false,writes=0;const c={release(){},query:async sql=>{
  if(sql==='ROLLBACK'){rolledBack=true;return {rows:[]};}if(sql.includes('UPDATE ai_stock'))writes++;
  if(sql.includes('SELECT * FROM ai_delivery_notes'))return {rows:[{id,location_id:id,status:'draft'}]};
  if(sql.includes('lower(supplier)'))return {rows:[],rowCount:0};
  if(sql.includes('SELECT * FROM ai_stock'))return {rows:[{id,unit:'kg',quantity:'999999000000'}]};return {rows:[{id}],rowCount:1};
 }};await assert.rejects(confirmNote({connect:async()=>c},body,{id}),e=>e.status===400);assert(rolledBack);assert.equal(writes,0);
});

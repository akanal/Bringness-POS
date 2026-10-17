import test from 'node:test';
import assert from 'node:assert/strict';
import {importOfflineSale,issueOfflineCatalog} from './offline-sales.js';

const user={id:'11111111-1111-4111-8111-111111111111',company_id:'22222222-2222-4222-8222-222222222222',role:'owner'};
const sale={id:'33333333-3333-4333-8333-333333333333',snapshotId:'44444444-4444-4444-8444-444444444444'};
test('revoked offline authority rolls back before catalog creation, replay or financial writes',async()=>{
 for(const operation of [db=>issueOfflineCatalog(db,user,'a'.repeat(64)),db=>importOfflineSale(db,user,'a'.repeat(64),sale)]){
  const calls=[];let released=false;
  const db={connect:async()=>({query:async sql=>{calls.push(sql);return {rows:[],rowCount:0};},release(){released=true;}})};
  await assert.rejects(operation(db),e=>e.status===403);
  assert.equal(calls[0],'BEGIN');assert.match(calls[1],/FROM users.*FOR SHARE/);
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,true);
  assert.equal(calls.some(sql=>sql.includes('INSERT')||sql.includes('pos_offline_catalogs')),false);
 }
});
test('offline import rejects coerced identifiers and device keys before acquiring a connection',async()=>{
 const db={connect:async()=>assert.fail('invalid input must not acquire a connection')};
 for(const request of [{...sale,id:[sale.id]},{...sale,snapshotId:[sale.snapshotId]},null,[]]){
  await assert.rejects(importOfflineSale(db,user,'a'.repeat(64),request),e=>e.status===400);
 }
 await assert.rejects(importOfflineSale(db,user,['a'.repeat(64)],sale),e=>e.status===400);
 await assert.rejects(issueOfflineCatalog(db,user,['a'.repeat(64)]),e=>e.status===400);
});

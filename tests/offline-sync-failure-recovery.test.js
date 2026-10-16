import assert from 'node:assert/strict';
import test from 'node:test';
import {createOfflineSync} from '../apps/desktop/offline-sync.mjs';

const sale = id => ({id,request:{id}});
function fixture({failOnce=false,offline=false}={}) {
 const queue=[sale('first'),sale('second')];
 const acknowledged=[],errors=[],server=new Map();
 let fail=failOnce,online=!offline,catalogs=0;
 const ledger={
  pending:async()=>queue.filter(s=>!acknowledged.some(a=>a.id===s.id)),
  acknowledge:async(id,receipt)=>acknowledged.push({id,receipt}),
  error:async(id,message)=>errors.push({id,message}),
  catalog:async()=>{catalogs++}
 };
 const sync=createOfflineSync({ledger,connect:async()=>online?async(endpoint,{sale:request}={})=>{
  if(endpoint==='catalog')return {snapshot:{id:'catalog'}};
  if(!server.has(request.id))server.set(request.id,{id:request.id,receiptNumber:'OFF-'+request.id});
  if(fail){fail=false;throw Error('Verbindung nach Server-Commit abgebrochen');}
  return server.get(request.id);
 }:null});
 return {sync,server,acknowledged,errors,queue,online:value=>online=value,catalogs:()=>catalogs};
}

test('Lost server acknowledgement retries without a second cloud sale',async()=>{
 const f=fixture({failOnce:true});
 assert.equal((await f.sync.sync()).state,'error');
 assert.equal(f.server.size,1);
 assert.equal(f.acknowledged.length,0);
 assert.equal(f.errors.length,1);
 assert.equal((await f.sync.sync()).state,'success');
 assert.equal(f.server.size,2);
 assert.deepEqual(f.acknowledged.map(x=>x.id),['first','second']);
 assert.equal(f.catalogs(),1);
});

test('Offline and login-unavailable states keep the local queue intact',async()=>{
 const f=fixture({offline:true});
 assert.equal((await f.sync.sync()).state,'login');
 assert.equal(f.acknowledged.length,0);
 f.online(true);
 assert.equal((await f.sync.sync()).state,'success');
 assert.equal(f.acknowledged.length,2);
});

test('Concurrent sync calls are single-flight and do not duplicate acknowledgement',async()=>{
 const f=fixture();
 await Promise.all([f.sync.sync(),f.sync.sync(true),f.sync.sync()]);
 assert.equal(f.server.size,2);
 assert.deepEqual(f.acknowledged.map(x=>x.id),['first','second']);
});

test('Expired login during upload leaves unsent sales queued for reauthentication',async()=>{
 const queue=[sale('first'),sale('second')],acknowledged=[],errors=[];
 let authenticated=true,uploads=0;
 const ledger={
  pending:async()=>queue.filter(s=>!acknowledged.includes(s.id)),
  acknowledge:async id=>acknowledged.push(id),
  error:async(id,message)=>errors.push({id,message}),
  catalog:async()=>{}
 };
 const coordinator=createOfflineSync({ledger,connect:async()=>async(endpoint,{sale:request}={})=>{
  if(endpoint==='catalog')return {snapshot:{}};
  uploads++;
  if(!authenticated){const error=Error('Nicht angemeldet');error.status=401;throw error;}
  if(uploads===2){authenticated=false;const error=Error('Nicht angemeldet');error.status=401;throw error;}
  return {id:request.id};
 }});
 assert.equal((await coordinator.sync()).state,'error');
 assert.deepEqual(acknowledged,['first']);
 assert.equal(errors.length,1);
 authenticated=true;
 assert.equal((await coordinator.sync()).state,'success');
 assert.deepEqual(acknowledged,['first','second']);
});

test('Catalog renewal rejected by license policy reports error without deleting saved sales',async()=>{
 const stored=[sale('previously-synced')],acknowledged=[];
 const ledger={
  pending:async()=>[],
  acknowledge:async id=>acknowledged.push(id),
  error:async()=>{},
  catalog:async()=>{throw Error('Aktive Download-Lizenz und Gerätefreigabe erforderlich')}
 };
 const coordinator=createOfflineSync({ledger,connect:async()=>async endpoint=>{
  if(endpoint==='catalog')return {snapshot:{validUntil:'2020-01-01T00:00:00Z'}};
  throw Error('Unexpected sale upload');
 }});
 assert.equal((await coordinator.sync()).state,'error');
 assert.equal(stored.length,1);
 assert.equal(acknowledged.length,0);
});

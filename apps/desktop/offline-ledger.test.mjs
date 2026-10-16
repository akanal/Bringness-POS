import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createOfflineLedger} from './offline-ledger.mjs';

test('durable acknowledgements reject reused receipts after reopening the database',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bringness-ledger-'));
 let db;
 const quote=(_snapshot,request)=>({id:request.id,items:[{lineCents:100}],totalCents:100});
 try{
  db=new PGlite(directory);
  let ledger=await createOfflineLedger(db,quote);
  const restaurantId=randomUUID(),otherRestaurant=randomUUID();
  const snapshot={id:randomUUID(),companyId:randomUUID(),deviceKey:'a'.repeat(64),
   createdAt:new Date().toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),
   restaurants:[{id:restaurantId,name:'One'},{id:otherRestaurant,name:'Two'}],products:[],merchant:{}};
  await ledger.catalog(snapshot);
  const add=async(restaurant=restaurantId)=>{
   const id=randomUUID();
   await ledger.sale({id,snapshotId:snapshot.id,restaurantId:restaurant});
   return id;
  };
  const first=await add();
  const pendingExport=await ledger.reconciliation();
  assert.equal(pendingExport.total,1);
  assert.equal(pendingExport.sales[0].offlineId,first);
  assert.equal(pendingExport.sales[0].state,'pending');
  assert.equal(Object.hasOwn(pendingExport.sales[0],'request'),false);
  await assert.rejects(ledger.reconciliation({limit:0}),/Ungültige Exportauswahl/);
  await assert.rejects(ledger.reconciliation({limit:1,onlyPending:'yes'}),/Ungültige Exportauswahl/);
  await ledger.acknowledge(first,{id:'cloud-one',receiptNumber:'R-1'});
  const syncedExport=await ledger.reconciliation({onlyPending:true});
  assert.equal(syncedExport.total,0);
  assert.equal((await ledger.reconciliation()).sales[0].state,'synced');
  const original=(await db.query('SELECT synced_at FROM offline_sales WHERE id=$1',[first])).rows[0].synced_at;
  await db.close();
  db=new PGlite(directory);
  ledger=await createOfflineLedger(db,quote);
  const second=await add();
  await assert.rejects(ledger.reconciliation({limit:1}),/unvollständiger Export/);
  await assert.rejects(ledger.acknowledge(second,{id:'cloud-one',receiptNumber:'R-2'}),/anderen Offline-Verkauf/);
  await assert.rejects(ledger.acknowledge(second,{id:'cloud-two',receiptNumber:'R-1'}),/anderen Offline-Verkauf/);
  assert.equal(await ledger.pendingCount(),1);
  await ledger.acknowledge(second,{id:'cloud-two',receiptNumber:'R-2'});
  // Replaying the same proof is harmless; it never rewrites the stored proof/date.
  await ledger.acknowledge(first,{id:'cloud-one',receiptNumber:'R-1',replayed:true});
  assert.equal(String((await db.query('SELECT synced_at FROM offline_sales WHERE id=$1',[first])).rows[0].synced_at),String(original));
  await assert.rejects(ledger.acknowledge(first,{id:'different',receiptNumber:'R-1'}),/Abweichende/);
  const third=await add(otherRestaurant);
  await ledger.acknowledge(third,{id:'cloud-three',receiptNumber:'R-1'});
  const fourth=await add(otherRestaurant);
  await assert.rejects(ledger.acknowledge(fourth,{id:'cloud-two',receiptNumber:'R-4'}),/anderen Offline-Verkauf/);
  await assert.rejects(ledger.acknowledge(fourth,{id:'cloud-four',receiptNumber:'R-4',replayed:'true'}),/Ungültige/);
  assert.equal(await ledger.pendingCount(),1);
  // Concurrent acknowledgements cannot attach the same cloud receipt twice.
  const fifth=await add();
  const results=await Promise.allSettled([
   ledger.acknowledge(fourth,{id:'cloud-shared',receiptNumber:'R-4'}),
   ledger.acknowledge(fifth,{id:'cloud-shared',receiptNumber:'R-5'})
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await ledger.pendingCount(),1);
 }finally{await db?.close();await rm(directory,{recursive:true,force:true});}
});

test('offline sale rejects a mismatched device key without writing a receipt',async()=>{
 const db=new PGlite();
 try{
  const ledger=await createOfflineLedger(db,(_snapshot,request)=>({id:request.id,items:[{lineCents:100}],totalCents:100}));
  const restaurantId=randomUUID();
  const snapshot={id:randomUUID(),companyId:randomUUID(),deviceKey:'a'.repeat(64),createdAt:new Date().toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),restaurants:[{id:restaurantId,name:'Test'}],products:[],merchant:{}};
  await ledger.catalog(snapshot);
  const request={id:randomUUID(),snapshotId:snapshot.id,restaurantId};
  await assert.rejects(ledger.sale(request,'b'.repeat(64)),/gehört nicht zu diesem Gerät/);
  assert.equal(await ledger.pendingCount(),0);
  await ledger.sale(request,'a'.repeat(64));
  assert.equal(await ledger.pendingCount(),1);
  await assert.rejects(ledger.sale(request,'b'.repeat(64)),/gehört nicht zu diesem Gerät/);
  assert.equal(await ledger.pendingCount(),1);
  const repeated=await ledger.sale(request,'a'.repeat(64));
  assert.equal(repeated.id,request.id);
  assert.equal(await ledger.pendingCount(),1);
 }finally{await db.close();}
});

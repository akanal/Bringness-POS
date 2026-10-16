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
  await ledger.acknowledge(first,{id:'cloud-one',receiptNumber:'R-1'});
  const original=(await db.query('SELECT synced_at FROM offline_sales WHERE id=$1',[first])).rows[0].synced_at;
  await db.close();
  db=new PGlite(directory);
  ledger=await createOfflineLedger(db,quote);
  const second=await add();
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

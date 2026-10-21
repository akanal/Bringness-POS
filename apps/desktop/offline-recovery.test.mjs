import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createOfflineLedger} from './offline-ledger.mjs';
import {quoteOfflineSale} from '../../server/offline-sale-core.js';
import {createOfflineSync} from './offline-sync.mjs';

test('recovery keeps original prices after catalog expiry and isolates company/device history',async t=>{
 const db=new PGlite();let clock=Date.now();t.mock.method(Date,'now',()=>clock);
 try{
  const ledger=await createOfflineLedger(db,quoteOfflineSale),restaurantId=randomUUID(),productId=randomUUID();
  const original={id:randomUUID(),companyId:randomUUID(),deviceKey:'a'.repeat(64),createdAt:new Date(clock).toISOString(),validUntil:new Date(clock+3600000).toISOString(),restaurants:[{id:restaurantId,name:'A'}],products:[{id:productId,restaurantId,name:'Coffee',priceCents:250,taxRate:19}],merchant:{[restaurantId]:{businessName:'A'}}};
  await ledger.catalog(original);
  const request={id:randomUUID(),snapshotId:original.id,restaurantId,createdAt:new Date(clock).toISOString(),paymentMethod:'cash',items:[{productId,quantity:2}]};
  const receipt=await ledger.sale(request,original.deviceKey);assert.equal(receipt.totalCents,500);
  clock+=2*3600000;
  const fresh={...original,id:randomUUID(),createdAt:new Date(clock).toISOString(),validUntil:new Date(clock+86400000).toISOString(),products:[{...original.products[0],priceCents:400}]};
  await ledger.catalog(fresh);
  assert.equal((await ledger.view()).snapshot.id,fresh.id);
  const recovery=await ledger.view({snapshotId:original.id});assert.equal(recovery.snapshot.products[0].priceCents,250);
  assert.deepEqual(await ledger.sale(request,original.deviceKey),receipt);
  await assert.rejects(ledger.sale({...request,id:randomUUID()},original.deviceKey),/abgelaufen/);
  assert.equal(await ledger.pendingCount(),1);
  const companyB={...fresh,id:randomUUID(),companyId:randomUUID()};
  await assert.rejects(ledger.catalog(companyB),/Offene Verkäufe/);
  await ledger.acknowledge(request.id,{id:'cloud-original',receiptNumber:'C-1'});
  await ledger.catalog(companyB);
  const other=await ledger.view();assert.equal(other.sales.length,0);assert.deepEqual(other.counts,{pending:0,errors:0,synced:0});
  assert.equal((await ledger.reconciliation()).total,0);
  await assert.rejects(ledger.view({snapshotId:original.id}),/nicht verfügbar/);
  await assert.rejects(ledger.sale(request,original.deviceKey),/aktuellen Betrieb/);
  await ledger.catalog({...fresh,id:randomUUID(),deviceKey:'b'.repeat(64)});
  await assert.rejects(ledger.view({snapshotId:original.id}),/nicht verfügbar/);
  await assert.rejects(ledger.sale(request,'b'.repeat(64)),/diesem Gerät/);
  await ledger.catalog({...fresh,id:randomUUID()});
  const restored=await ledger.view();assert.equal(restored.sales.length,1);assert.equal(restored.counts.synced,1);
  assert.deepEqual(restored.sales[0].receipt,receipt);assert.equal((await ledger.reconciliation()).sales[0].offlineId,request.id);
  assert.deepEqual(await ledger.sale(request,original.deviceKey),receipt);
  await assert.rejects(ledger.view({snapshotId:'invalid'}),/Ungültiger/);
 }finally{await db.close();}
});

test('short catalog lease refreshes before six hours without extending server expiry',async()=>{
 let clock=Date.now(),calls=0,fail=false;const expiry=clock+4*60000;
 const ledger={pending:async()=>[],pendingCount:async()=>0,catalog:async()=>{}};
 const sync=createOfflineSync({ledger,now:()=>clock,connect:async()=>async endpoint=>{
  assert.equal(endpoint,'catalog');calls++;if(fail)throw Error('server unavailable');
  return {snapshot:{id:'server-catalog',validUntil:new Date(expiry).toISOString()}};
 }});
 assert.equal((await sync.sync()).state,'success');assert.equal(calls,1);
 clock+=30000;await sync.sync();assert.equal(calls,1);
 clock+=30000;assert.equal((await sync.sync()).state,'success');assert.equal(calls,2);
 fail=true;clock+=60000;assert.equal((await sync.sync()).state,'warning');assert.equal(calls,3);
 fail=false;clock=expiry+1;const expired=await sync.sync();assert.equal(expired.state,'warning');assert.match(expired.message,/Ungültiger Offline-Katalog/);
});

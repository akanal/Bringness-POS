import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteOfflineSale,offlineFingerprint,canonicalJson,offlineCatalogValidUntil} from '../server/offline-sale-core.js';

const restaurantId='restaurant-1';
const snapshot={
 id:'snapshot-1',deviceKey:'a'.repeat(64),
 createdAt:'2026-10-15T00:00:00.000Z',validUntil:'2026-10-18T00:00:00.000Z',
 restaurants:[{id:restaurantId}],
 products:[{id:'product-1',restaurantId,name:'Kaffee',priceCents:250,taxRate:19}],
 merchant:{[restaurantId]:{businessName:'Testbetrieb'}}
};
const sale={
 id:'c87a3b13-8a46-48a0-8d70-82cf2e08c621',snapshotId:snapshot.id,
 restaurantId,createdAt:'2026-10-16T10:00:00Z',
 items:[{productId:'product-1',quantity:2}],paymentMethod:'cash'
};
test('offline quote uses catalog prices and produces a stable receipt',()=>{
 const quoted=quoteOfflineSale(snapshot,{...sale,items:[{...sale.items[0],priceCents:1}]});
 assert.equal(quoted.totalCents,500);
 assert.equal(quoted.items[0].unitPriceCents,250);
 assert.equal(quoted.fiscalStatus,'pending');
 assert.match(quoted.receiptNumber,/^OFF-aaaaaaaaaaaa-/);
});
test('offline import rejects forged catalog identifiers',()=>{
 assert.throws(()=>quoteOfflineSale(snapshot,{...sale,snapshotId:'wrong'}),/Offline-Kennung/);
});
test('offline import rejects products belonging to another restaurant',()=>{
 assert.throws(()=>quoteOfflineSale(snapshot,{...sale,items:[{productId:'other',quantity:1}]}),/Offline-Artikel/);
});
test('offline import rejects duplicate positions and invalid quantities',()=>{
 assert.throws(()=>quoteOfflineSale(snapshot,{...sale,items:[sale.items[0],sale.items[0]]}),/Offline-Artikel/);
 assert.throws(()=>quoteOfflineSale(snapshot,{...sale,items:[{productId:'product-1',quantity:0}]}),/Offline-Artikel/);
});
test('offline import rejects noncash payment and out-of-window sales',()=>{
 assert.throws(()=>quoteOfflineSale(snapshot,{...sale,paymentMethod:'card'}),/Barzahlung/);
 assert.throws(()=>quoteOfflineSale(snapshot,{...sale,createdAt:'2026-10-19T10:00:00Z'}),/Offline-Zeit/);
});
test('offline quote rejects integer overflow and zero total',()=>{
 assert.throws(()=>quoteOfflineSale({...snapshot,products:[{...snapshot.products[0],priceCents:2147483647}]},{...sale,items:[{productId:'product-1',quantity:2}]}),/Gesamtbetrag/);
 assert.throws(()=>quoteOfflineSale({...snapshot,products:[{...snapshot.products[0],priceCents:0}]},sale),/Gesamtbetrag/);
});
test('offline fingerprints are stable across object key ordering',()=>{
 assert.equal(canonicalJson({b:2,a:{z:3,x:1}}),canonicalJson({a:{x:1,z:3},b:2}));
 assert.equal(offlineFingerprint({b:2,a:1}),offlineFingerprint({a:1,b:2}));
});

test('offline catalog expiry never exceeds 24 hours',()=>{
 const issued='2026-10-16T10:00:00.000Z';
 assert.equal(offlineCatalogValidUntil('2027-10-16T10:00:00.000Z',issued),'2026-10-17T10:00:00.000Z');
});
test('offline catalog expiry honors earlier license expiration',()=>{
 const issued='2026-10-16T10:00:00.000Z';
 assert.equal(offlineCatalogValidUntil('2026-10-16T13:00:00.000Z',issued),'2026-10-16T13:00:00.000Z');
});
test('offline catalog rejects expired and invalid license dates',()=>{
 const issued='2026-10-16T10:00:00.000Z';
 assert.throws(()=>offlineCatalogValidUntil('2026-10-16T09:59:59.000Z',issued),/Offline-Lizenz abgelaufen/);
 assert.throws(()=>offlineCatalogValidUntil('invalid',issued),/Offline-Lizenz abgelaufen/);
});

test('offline sale rejects non-string timestamps',()=>{
 for(const createdAt of [null,0,1234567890,{},[]]){
  assert.throws(()=>quoteOfflineSale(snapshot,{...sale,createdAt}),/Offline-Zeit/);
 }
});

test('offline sale rejects malformed identifier types',()=>{
 for(const id of [null,123,{},[],true]){
  assert.throws(()=>quoteOfflineSale(snapshot,{...sale,id}),/Offline-Kennung/);
 }
});

test('offline sale rejects null and malformed line items as validation errors',()=>{
 for(const item of [null,undefined,0,'product-1',{}]){
  assert.throws(()=>quoteOfflineSale(snapshot,{...sale,items:[item]}),error=>error.status===400&&/Offline-Artikel/.test(error.message));
 }
});

test('offline sale tolerates damaged catalog rows but rejects unknown products',()=>{
 const damaged={...snapshot,restaurants:[null,...snapshot.restaurants],products:[null,...snapshot.products]};
 assert.equal(quoteOfflineSale(damaged,sale).totalCents,500);
 assert.throws(()=>quoteOfflineSale({...damaged,products:[null]},sale),/Offline-Artikel/);
});

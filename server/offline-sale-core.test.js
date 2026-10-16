import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteOfflineSale,offlineCatalogValidUntil} from './offline-sale-core.js';

const id='11111111-1111-4111-8111-111111111111';
function fixture(){
 const now=new Date();
 const snapshot={id:'snapshot',deviceKey:'device_123456789',createdAt:new Date(now.getTime()-60000).toISOString(),validUntil:new Date(now.getTime()+3600000).toISOString(),restaurants:[{id:'restaurant'}],products:[{id:'product',restaurantId:'restaurant',name:'Coffee',priceCents:250,taxRate:19}],merchant:{restaurant:{name:'Cafe'}}};
 const sale={id,snapshotId:'snapshot',restaurantId:'restaurant',createdAt:now.toISOString(),items:[{productId:'product',quantity:2}],paymentMethod:'cash'};
 return {snapshot,sale};
}
test('offline cash sale uses catalog prices and remains fiscally pending',()=>{
 const {snapshot,sale}=fixture();sale.items[0].priceCents=1;
 const result=quoteOfflineSale(snapshot,sale);
 assert.equal(result.totalCents,500);assert.equal(result.fiscalStatus,'pending');
 assert.equal(result.receiptNumber,'OFF-device_12345-'+id);
});
test('offline sale rejects invalid device identities',()=>{
 for(const deviceKey of [undefined,'short','contains spaces','x'.repeat(129)]){
  const {snapshot,sale}=fixture();snapshot.deviceKey=deviceKey;
  assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Kennung/);
 }
});
test('offline sale rejects malformed merchant records',()=>{
 for(const merchant of [[],null]){
  const {snapshot,sale}=fixture();snapshot.merchant.restaurant=merchant;
  assert.throws(()=>quoteOfflineSale(snapshot,sale),/Verkäuferdaten/);
 }
});
test('offline sale refuses non-cash payment',()=>{
 const {snapshot,sale}=fixture();sale.paymentMethod='card';
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Barzahlung/);
});
test('offline license window never exceeds 24 hours',()=>{
 const issued=new Date('2026-10-16T12:00:00Z');
 assert.equal(offlineCatalogValidUntil('2026-10-20T12:00:00Z',issued),'2026-10-17T12:00:00.000Z');
 assert.throws(()=>offlineCatalogValidUntil('2026-10-15T12:00:00Z',issued),/abgelaufen/);
 for(const missing of [null,undefined])assert.throws(()=>offlineCatalogValidUntil(missing,issued),/abgelaufen/);
});

test('offline sale rejects missing snapshot identifiers and duplicate products',()=>{
 const {snapshot,sale}=fixture();snapshot.id='';sale.snapshotId='';
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Kennung/);
 const valid=fixture();valid.sale.items.push({...valid.sale.items[0]});
 assert.throws(()=>quoteOfflineSale(valid.snapshot,valid.sale),/Offline-Artikel/);
});

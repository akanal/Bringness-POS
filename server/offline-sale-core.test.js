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
 for(const missing of [null,undefined,0,false,1])assert.throws(()=>offlineCatalogValidUntil(missing,issued),/abgelaufen/);
});

test('offline sale rejects missing snapshot identifiers and duplicate products',()=>{
 const {snapshot,sale}=fixture();snapshot.id=' ';sale.snapshotId=' ';
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Kennung/);
 const valid=fixture();valid.sale.items.push({...valid.sale.items[0]});
 assert.throws(()=>quoteOfflineSale(valid.snapshot,valid.sale),/Offline-Artikel/);
});


test('offline sale rejects catalog authorization windows exceeding 24 hours',()=>{
 const {snapshot,sale}=fixture();snapshot.validUntil=new Date(Date.parse(snapshot.createdAt)+25*3600000).toISOString();
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Zeit/);
});


test('offline sales require nonempty catalog product and restaurant identifiers',()=>{
 const product=fixture();product.snapshot.products[0].id=' ';product.sale.items[0].productId=' ';
 assert.throws(()=>quoteOfflineSale(product.snapshot,product.sale),/Offline-Artikel/);
 const restaurant=fixture();restaurant.snapshot.restaurants[0].id=' ';restaurant.sale.restaurantId=' ';
 assert.throws(()=>quoteOfflineSale(restaurant.snapshot,restaurant.sale),/Offline-Katalog/);
});


test('offline seller details must belong to the restaurant map itself',()=>{
 const {snapshot,sale}=fixture();
 snapshot.merchant=Object.create({restaurant:{name:'Inherited Cafe'}});
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Verkäuferdaten/);
});


test('offline catalog timestamps reject non-string input without coercion',()=>{
 for(const field of ['createdAt','validUntil']){
  const {snapshot,sale}=fixture();snapshot[field]={toString(){throw Error('unexpected coercion')}};
  assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Zeit/);
 }
});


test('offline catalog issue time rejects coerced primitive values',()=>{
 for(const issued of [0,false,{},null]){
  assert.throws(()=>offlineCatalogValidUntil('2026-10-20T12:00:00Z',issued),/abgelaufen/);
 }
});


test('offline catalog rejects future authorization start',()=>{
 const {snapshot,sale}=fixture();
 snapshot.createdAt=new Date(Date.now()+5*60000).toISOString();
 snapshot.validUntil=new Date(Date.now()+60*60000).toISOString();
 sale.createdAt=new Date(Date.now()+5*60000).toISOString();
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Zeit/);
});


test('offline sale rejects duplicate catalog product records',()=>{
 const {snapshot,sale}=fixture();
 snapshot.products.push({...snapshot.products[0],priceCents:1});
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Artikel/);
});


test('offline sale rejects duplicate catalog restaurant identifiers',()=>{
 const {snapshot,sale}=fixture();
 snapshot.restaurants.push({...snapshot.restaurants[0]});
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Katalog/);
});


test('offline sale requires structured inputs',()=>{
 const {snapshot,sale}=fixture();
 assert.throws(()=>quoteOfflineSale(snapshot,[]),/Offline-Kennung/);
 assert.throws(()=>quoteOfflineSale([],sale),/Offline-Kennung/);
});


test('null catalog products are ignored without crashing',()=>{
 const {snapshot,sale}=fixture();
 snapshot.products.unshift(null);
 assert.equal(quoteOfflineSale(snapshot,sale).totalCents,500);
});


test('offline sale rejects unsafe quantity integers',()=>{
 const {snapshot,sale}=fixture();
 sale.items[0].quantity=Number.MAX_SAFE_INTEGER+1;
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Artikel/);
});


test('offline seller must have a nonempty display name',()=>{
 const {snapshot,sale}=fixture();
 snapshot.merchant.restaurant.name=' ';
 assert.throws(()=>quoteOfflineSale(snapshot,sale),/Verkäuferdaten/);
});

test('offline authorization rejects a future issue time',()=>{
 assert.throws(()=>offlineCatalogValidUntil('2100-01-03T00:00:00Z','2100-01-01T00:00:00Z'),/abgelaufen/);
});

test('offline sale requires an explicit product ID even with malformed catalog entries',()=>{
 for(const productId of [undefined,null,42,'']){
  const {snapshot,sale}=fixture();snapshot.products.unshift(null);sale.items[0].productId=productId;
  assert.throws(()=>quoteOfflineSale(snapshot,sale),/Offline-Artikel/);
 }
});

import test from 'node:test';import assert from 'node:assert/strict';
import {quoteCenterCart,guestCenterCheckout} from './center-guest-checkout.js';
const id='11111111-1111-4111-8111-111111111111',products=[{id,price_cents:1250,name:'Gericht'}];
test('guest prices are ignored in favor of server prices',()=>assert.equal(quoteCenterCart([{productId:id,quantity:2,price_cents:1}],products).totalCents,2500));
test('invalid quantities, unavailable products and duplicates are blocked',()=>{for(const items of [[{productId:id,quantity:0}],[{productId:id,quantity:1.5}],[{productId:id,quantity:1},{productId:id,quantity:1}]])assert.throws(()=>quoteCenterCart(items,products));assert.throws(()=>quoteCenterCart([{productId:id,quantity:1}],[]));});
test('checkout stays disabled before rollout',async()=>assert.rejects(guestCenterCheckout({connect(){throw Error('no database mutation')}},{},{}),/CENTER_CHECKOUT_DISABLED/));

import {centerProductAvailable,visibleCenterProducts} from './center-availability.js';
test('stock, overnight hours and seasonal wraparound are checked at request time',()=>{
 const product={id,availability_rule:JSON.stringify({enabled:true,startTime:'22:00',endTime:'02:00',startDate:'2026-12-01',endDate:'2026-02-28'})};
 assert.equal(centerProductAvailable(product,new Date('2026-01-10T22:00:00Z')),true);
 assert.equal(centerProductAvailable(product,new Date('2026-01-10T12:00:00Z')),false);
 assert.equal(centerProductAvailable(product,new Date('2026-06-10T21:00:00Z')),false);
 assert.equal(centerProductAvailable({...product,ai_stock_available:false},new Date('2026-01-10T22:00:00Z')),false);
 assert.equal(centerProductAvailable({availability_rule:'broken'}),false);
 assert.deepEqual(visibleCenterProducts([{id,ai_stock_available:true,availability_rule:null}]),[{id}]);
});

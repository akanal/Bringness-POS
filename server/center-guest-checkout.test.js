import test from 'node:test';import assert from 'node:assert/strict';
import {quoteCenterCart,guestCenterCheckout} from './center-guest-checkout.js';
const id='11111111-1111-4111-8111-111111111111',products=[{id,price_cents:1250,name:'Gericht'}];
test('guest prices are ignored in favor of server prices',()=>assert.equal(quoteCenterCart([{productId:id,quantity:2,price_cents:1}],products).totalCents,2500));
test('invalid quantities, unavailable products and duplicates are blocked',()=>{for(const items of [[{productId:id,quantity:0}],[{productId:id,quantity:1.5}],[{productId:id,quantity:1},{productId:id,quantity:1}]])assert.throws(()=>quoteCenterCart(items,products));assert.throws(()=>quoteCenterCart([{productId:id,quantity:1}],[]));});
test('checkout stays disabled before rollout',async()=>assert.rejects(guestCenterCheckout({connect(){throw Error('no database mutation')}},{},{}),/CENTER_CHECKOUT_DISABLED/));

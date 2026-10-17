import {test} from 'node:test';import assert from 'node:assert/strict';import {legacyGuestItems} from './guest-cart-input.js';
const id='AAAAAAAA-1111-4111-8111-111111111111',item={productId:id,qty:2};
test('guest item normalization rejects coercion and duplicate IDs before a transaction',()=>{
 assert.deepEqual(legacyGuestItems([item]),[{productId:id.toLowerCase(),qty:2,note:'',extraIds:[]}]);
 for(const value of [[null],[{...item,qty:'2'}],[{...item,extraIds:[id,id.toLowerCase()]}],[{...item,extraIds:['bad']}],[{...item,note:{}}],[item,{...item,productId:id.toLowerCase()}]])assert.throws(()=>legacyGuestItems(value),e=>e.status===400);
});

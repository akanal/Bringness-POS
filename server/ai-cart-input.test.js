import {test} from 'node:test';import assert from 'node:assert/strict';import {cartTransaction} from './ai-cart.js';
const id='AAAAAAAA-1111-4111-8111-111111111111',line={productId:id,stockId:id,packs:1};
test('cart refuses malformed lines and case-aliased duplicate positions before connecting',async()=>{
 const db={connect(){throw Error('Unexpected transaction');}},u={id,role:'restaurant'};
 for(const lines of [[null],[[]],[{...line,productId:[id]}],[line,{...line,productId:id.toLowerCase(),stockId:id.toLowerCase()}]])await assert.rejects(cartTransaction(db,u,{lines,deliveryDate:'2026-10-17'},{checkout:false}),e=>e.status===400);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyShopProviderPayment as verify} from './shop-payment-provider-check.js';
const expected={orderId:'order-1',providerReference:'tr_123',amountCents:3499,currency:'EUR'};
const provider={id:'tr_123',orderId:'order-1',amountCents:3499,currency:'EUR',status:'paid'};
test('server provider facts must match immutable order exactly',()=>{
 assert.deepEqual(verify(expected,provider),{id:'tr_123',kind:'paid',amountCents:3499,providerReference:'tr_123',verified:true});
 assert.throws(()=>verify(expected,{...provider,id:'tr_other'}),/REFERENCE_MISMATCH/);
 assert.throws(()=>verify(expected,{...provider,orderId:'other-order'}),/ORDER_MISMATCH/);
 assert.throws(()=>verify(expected,{...provider,amountCents:3498}),/AMOUNT_MISMATCH/);
 assert.throws(()=>verify(expected,{...provider,currency:'USD'}),/CURRENCY_MISMATCH/);
 for(const status of ['open','pending','failed','canceled','refunded'])assert.throws(()=>verify(expected,{...provider,status}),/NOT_PAID/);
});

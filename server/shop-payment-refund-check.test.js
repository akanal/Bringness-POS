import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyShopProviderRefund as verify} from './shop-payment-refund-check.js';
const expected={orderId:'order-1',providerReference:'tr_123',currency:'EUR'};
const refund={id:'re_456',paymentId:'tr_123',orderId:'order-1',currency:'EUR',amountCents:500,status:'refunded'};
test('refund requires confirmed provider facts for same order and payment',()=>{
 assert.deepEqual(verify(expected,refund),{id:'re_456',kind:'refund',amountCents:500,providerReference:'tr_123',verified:true});
 assert.throws(()=>verify(expected,{...refund,paymentId:'tr_wrong'}),/PAYMENT_MISMATCH/);
 assert.throws(()=>verify(expected,{...refund,orderId:'other'}),/ORDER_MISMATCH/);
 assert.throws(()=>verify(expected,{...refund,currency:'USD'}),/CURRENCY_MISMATCH/);
 assert.throws(()=>verify(expected,{...refund,status:'pending'}),/NOT_CONFIRMED/);
 assert.throws(()=>verify(expected,{...refund,amountCents:0}),/AMOUNT_INVALID/);
 assert.throws(()=>verify(expected,{...refund,id:'invalid'}),/ID_INVALID/);
});

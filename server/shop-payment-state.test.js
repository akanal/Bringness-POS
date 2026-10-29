import test from 'node:test';
import assert from 'node:assert/strict';
import {nextShopPaymentState,assertShopPaymentAmount} from './shop-payment-state.js';
const orderId='11111111-1111-4111-8111-111111111111';
test('payment confirmation cannot be claimed without verified provider event',()=>{
 assert.equal(nextShopPaymentState('unpaid','begin'),'pending');
 assert.throws(()=>nextShopPaymentState('pending','confirm'),/PROVIDER_CONFIRMATION_REQUIRED/);
 assert.equal(nextShopPaymentState('pending','confirm',{verifiedProviderEvent:true}),'paid');
 assert.throws(()=>nextShopPaymentState('paid','refund'),/PROVIDER_CONFIRMATION_REQUIRED/);
 assert.equal(nextShopPaymentState('paid','refund',{verifiedProviderEvent:true}),'refunded');
 assert.throws(()=>nextShopPaymentState('refunded','confirm',{verifiedProviderEvent:true}),/TRANSITION_INVALID/);
 assert.throws(()=>nextShopPaymentState('cancelled','begin'),/TRANSITION_INVALID/);
});
test('partial refunds need provider verification',()=>{
 assert.equal(nextShopPaymentState('paid','partial_refund',{verifiedProviderEvent:true}),'partially_refunded');
 assert.throws(()=>nextShopPaymentState('partially_refunded','partial_refund'),/PROVIDER_CONFIRMATION_REQUIRED/);
 assert.equal(nextShopPaymentState('partially_refunded','refund',{verifiedProviderEvent:true}),'refunded');
});
test('payment amount is positive integer EUR and has a valid order UUID',()=>{
 assert.deepEqual(assertShopPaymentAmount({amountCents:3499,currency:'EUR',orderId}),{amountCents:3499,currency:'EUR',orderId});
 for(const amountCents of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>assertShopPaymentAmount({amountCents,currency:'EUR',orderId}),/AMOUNT_INVALID/);
 assert.throws(()=>assertShopPaymentAmount({amountCents:1,currency:'USD',orderId}),/CURRENCY_INVALID/);
 assert.throws(()=>assertShopPaymentAmount({amountCents:1,currency:'EUR',orderId:'not-a-uuid'}),/ORDER_INVALID/);
});

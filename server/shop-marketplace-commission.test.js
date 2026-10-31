import test from 'node:test';
import assert from 'node:assert/strict';
import {marketplaceCommission as quote,marketplaceCommissionRefund as refund} from './shop-marketplace-commission.js';
test('five percent of net goods, no monthly fee',()=>{
 const s=quote(10000);assert.equal(s.feeNetCents,500);assert.equal(s.monthlyFeeCents,0);
 assert.equal(s.basis,'goods-net-excluding-shipping');
});
test('full refund returns all commission; partial returns only refunded goods fee',()=>{
 const s=quote(10000);
 assert.deepEqual(refund(s,{refundedGoodsNetCents:4000}),{currency:'EUR',refundFeeNetCents:200,totalRefundedFeeNetCents:200,remainingFeeNetCents:300});
 assert.equal(refund(s,{previousRefundedGoodsNetCents:4000,refundedGoodsNetCents:10000}).refundFeeNetCents,300);
 assert.equal(refund(s,{refundedGoodsNetCents:10000}).remainingFeeNetCents,0);
 assert.equal(refund(s,{previousRefundedGoodsNetCents:4000,refundedGoodsNetCents:4000}).refundFeeNetCents,0);
});
test('split refunds return exactly original rounded fee including tiny orders',()=>{
 for(let total=0;total<300;total++){
  const s=quote(total);let returned=0;
  for(let n=1;n<=total;n++)returned+=refund(s,{previousRefundedGoodsNetCents:n-1,refundedGoodsNetCents:n}).refundFeeNetCents;
  assert.equal(returned,s.feeNetCents);
 }
});
test('invalid money, changed snapshots and over-refunds fail closed',()=>{
 for(const n of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,undefined])assert.throws(()=>quote(n));
 const s=quote(100);
 for(const args of [{refundedGoodsNetCents:101},{previousRefundedGoodsNetCents:50,refundedGoodsNetCents:40},{refundedGoodsNetCents:0.5}])assert.throws(()=>refund(s,args));
 assert.throws(()=>refund({...s,feeNetCents:0},{refundedGoodsNetCents:100}));
 assert.equal(quote(Number.MAX_SAFE_INTEGER).feeNetCents,450359962737050);
});

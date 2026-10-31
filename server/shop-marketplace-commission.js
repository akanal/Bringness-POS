// Server-side fee policy. Amounts are integer EUR cents, never gross payment
// totals. This module neither submits provider fees nor initiates refunds.
const version='net-goods-5-v1';
function cents(value){
 if(!Number.isSafeInteger(value)||value<0)throw Error('INVALID_COMMISSION_AMOUNT');
 return value;
}
const fee=value=>Number((BigInt(cents(value))*5n+50n)/100n);
export function marketplaceCommission(goodsNetCents){
 cents(goodsNetCents);
 return Object.freeze({version,currency:'EUR',basis:'goods-net-excluding-shipping',
  rateBasisPoints:500,goodsNetCents,feeNetCents:fee(goodsNetCents),monthlyFeeCents:0});
}
// Inputs must come from persisted, verified item refund allocations. A gross
// provider refund alone cannot establish the goods net amount (mixed VAT,
// shipping). Cumulative totals avoid penny loss across multiple partial refunds.
// The caller must persist/deduplicate provider events transactionally.
export function marketplaceCommissionRefund(snapshot,{previousRefundedGoodsNetCents=0,refundedGoodsNetCents}){
 const expected=marketplaceCommission(snapshot?.goodsNetCents);
 if(Object.keys(expected).some(key=>snapshot[key]!==expected[key]))throw Error('INVALID_COMMISSION_SNAPSHOT');
 const before=cents(previousRefundedGoodsNetCents),after=cents(refundedGoodsNetCents);
 if(after<before||after>expected.goodsNetCents)throw Error('INVALID_COMMISSION_REFUND');
 const returned=fee(after);
 return Object.freeze({currency:'EUR',refundFeeNetCents:returned-fee(before),
  totalRefundedFeeNetCents:returned,remainingFeeNetCents:expected.feeNetCents-returned});
}

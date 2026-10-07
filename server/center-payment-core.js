// Internal contract only: providerPayment must come from a server-side merchant API read,
// never from a guest payload or an unverified webhook body. No public route uses this yet.
export function validateCenterPayment(expected, providerPayment) {
  const fail=reason=>({release:false,reason});
  if(!expected?.merchantReference || !expected?.paymentId || !expected?.orderId)return fail('missing_payment_binding');
  if(!Number.isSafeInteger(expected.amountCents)||expected.amountCents<=0||expected.currency!=='EUR')return fail('invalid_expected_amount');
  if(providerPayment?.merchantReference!==expected.merchantReference)return fail('merchant_mismatch');
  if(providerPayment.paymentId!==expected.paymentId||providerPayment.orderId!==expected.orderId)return fail('order_mismatch');
  if(providerPayment.currency!==expected.currency||providerPayment.amountCents!==expected.amountCents)return fail('amount_mismatch');
  if(providerPayment.status!=='paid')return fail('payment_not_paid');
  if(providerPayment.refundedCents!==0||providerPayment.chargedBackCents!==0)return fail('payment_reversed_or_unknown');
  return {release:true,reason:'verified_paid'};
}

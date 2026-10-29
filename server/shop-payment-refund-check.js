// Refund records must be retrieved server-side from the provider.
// A webhook body, merchant UI, or buyer request is not proof of refund.
export function verifyShopProviderRefund({orderId,providerReference,currency},providerRefund){
 if(!providerRefund||typeof providerRefund!=='object')throw Error('PROVIDER_REFUND_MISSING');
 if(providerRefund.paymentId!==providerReference)throw Error('PROVIDER_REFUND_PAYMENT_MISMATCH');
 if(providerRefund.orderId!==orderId)throw Error('PROVIDER_REFUND_ORDER_MISMATCH');
 if(currency!=='EUR'||providerRefund.currency!==currency)throw Error('PROVIDER_REFUND_CURRENCY_MISMATCH');
 if(!Number.isSafeInteger(providerRefund.amountCents)||providerRefund.amountCents<=0)throw Error('PROVIDER_REFUND_AMOUNT_INVALID');
 if(providerRefund.status!=='refunded')throw Error('PROVIDER_REFUND_NOT_CONFIRMED');
 if(typeof providerRefund.id!=='string'||!/^re_[A-Za-z0-9]+$/.test(providerRefund.id))throw Error('PROVIDER_REFUND_ID_INVALID');
 return Object.freeze({id:providerRefund.id,kind:'refund',amountCents:providerRefund.amountCents,providerReference,verified:true});
}

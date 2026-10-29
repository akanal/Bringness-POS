// Provider adapter boundary: accept only data fetched by the trusted server adapter.
// This function does NOT authenticate a webhook or fetch from Mollie by itself.
export function verifyShopProviderPayment({orderId,providerReference,amountCents,currency},providerPayment){
 if(!providerPayment||typeof providerPayment!=='object')throw Error('PROVIDER_PAYMENT_MISSING');
 if(providerPayment.id!==providerReference)throw Error('PROVIDER_REFERENCE_MISMATCH');
 if(providerPayment.orderId!==orderId)throw Error('PROVIDER_ORDER_MISMATCH');
 if(providerPayment.currency!==currency||currency!=='EUR')throw Error('PROVIDER_CURRENCY_MISMATCH');
 if(!Number.isSafeInteger(providerPayment.amountCents)||providerPayment.amountCents!==amountCents)throw Error('PROVIDER_AMOUNT_MISMATCH');
 if(providerPayment.status!=='paid')throw Error('PROVIDER_PAYMENT_NOT_PAID');
 return Object.freeze({id:providerPayment.id,kind:'paid',amountCents,providerReference,verified:true});
}

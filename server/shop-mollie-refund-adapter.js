// Read-only Mollie refund adapter. It cannot initiate or cancel refunds.
// Keys must be injected from server-side secret configuration.
export function createShopMollieRefundFetcher({apiKey,fetchImpl=globalThis.fetch}){
 if(typeof apiKey!=='string'||!/^(test|live)_[A-Za-z0-9]{10,}$/.test(apiKey))throw Error('MOLLIE_API_KEY_INVALID');
 if(typeof fetchImpl!=='function')throw Error('MOLLIE_FETCH_UNAVAILABLE');
 return async function fetchProviderRefund(paymentId,refundId){
  if(typeof paymentId!=='string'||!/^tr_[A-Za-z0-9]+$/.test(paymentId)||typeof refundId!=='string'||!/^re_[A-Za-z0-9]+$/.test(refundId))throw Error('MOLLIE_REFUND_REFERENCE_INVALID');
  const response=await fetchImpl(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`,{method:'GET',headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('MOLLIE_REFUND_FETCH_FAILED');
  const data=await response.json();
  if(data?.id!==refundId||data?.paymentId!==paymentId)throw Error('MOLLIE_REFUND_REFERENCE_MISMATCH');
  if(typeof data?.amount?.value!=='string'||!/^\d+\.\d{2}$/.test(data.amount.value))throw Error('MOLLIE_REFUND_AMOUNT_INVALID');
  const [euros,cents]=data.amount.value.split('.');
  const amountCents=Number(euros)*100+Number(cents);
  if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('MOLLIE_REFUND_AMOUNT_INVALID');
  return {id:data.id,paymentId:data.paymentId,orderId:data.metadata?.shopOrderId,currency:data.amount.currency,amountCents,status:data.status};
 };
}

// Read-only refund enumeration; no creation or cancellation of payments.
export function createShopMollieRefundLister({apiKey,fetchImpl=globalThis.fetch}){
 if(typeof apiKey!=='string'||!/^(test|live)_[A-Za-z0-9]{10,}$/.test(apiKey))throw Error('MOLLIE_API_KEY_INVALID');
 if(typeof fetchImpl!=='function')throw Error('MOLLIE_FETCH_UNAVAILABLE');
 return async function listProviderRefunds(paymentId){
  if(typeof paymentId!=='string'||!/^tr_[A-Za-z0-9]+$/.test(paymentId))throw Error('MOLLIE_PAYMENT_REFERENCE_INVALID');
  const response=await fetchImpl(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}/refunds?limit=100`,{method:'GET',headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('MOLLIE_REFUND_LIST_FETCH_FAILED');
  const data=await response.json();
  const refunds=data?._embedded?.refunds;
  if(!Array.isArray(refunds)||refunds.length>100)throw Error('MOLLIE_REFUND_LIST_INVALID');
  // Never silently accept an incomplete refund history.
  if(data?._links?.next?.href)throw Error('MOLLIE_REFUND_LIST_PAGINATION_REQUIRED');
  if(data?.count!==undefined&&(!Number.isSafeInteger(data.count)||data.count<refunds.length))throw Error('MOLLIE_REFUND_LIST_INVALID');
  if(data?.count>refunds.length)throw Error('MOLLIE_REFUND_LIST_PAGINATION_REQUIRED');
  return refunds.map(refund=>({id:refund.id,status:refund.status}));
 };
}

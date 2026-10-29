// Server-only adapter. No routes or checkout activation.
// The API key must be supplied by secure server configuration, never by a client.
export function createShopMolliePaymentFetcher({apiKey,fetchImpl=globalThis.fetch,apiBase='https://api.mollie.com/v2'}){
 if(typeof apiKey!=='string'||!/^((test|live)_)[A-Za-z0-9]{10,}$/.test(apiKey))throw Error('MOLLIE_API_KEY_INVALID');
 if(typeof fetchImpl!=='function')throw Error('MOLLIE_FETCH_UNAVAILABLE');
 if(apiBase!=='https://api.mollie.com/v2')throw Error('MOLLIE_API_BASE_INVALID');
 return async function fetchProviderPayment(reference){
  if(typeof reference!=='string'||!/^tr_[A-Za-z0-9]+$/.test(reference))throw Error('MOLLIE_PAYMENT_REFERENCE_INVALID');
  const response=await fetchImpl(`${apiBase}/payments/${encodeURIComponent(reference)}`,{method:'GET',headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('MOLLIE_PAYMENT_FETCH_FAILED');
  const contentType=response.headers?.get?.('content-type');
  if(contentType&&!/^application\/json(?:\s*;|\s*$)/i.test(contentType))throw Error('MOLLIE_PAYMENT_CONTENT_TYPE_INVALID');
  const data=await response.json();
  const amount=data?.amount;
  if(typeof amount?.value!=='string'||!/^\d+\.\d{2}$/.test(amount.value))throw Error('MOLLIE_AMOUNT_INVALID');
  const [euros,cents]=amount.value.split('.');
  const amountCents=Number(euros)*100+Number(cents);
  if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('MOLLIE_AMOUNT_INVALID');
  return {id:data.id,orderId:data.metadata?.shopOrderId,amountCents,currency:amount.currency,status:data.status};
 };
}

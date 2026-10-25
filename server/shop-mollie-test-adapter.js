import {validShopBuyerEmail,validShopBuyerName} from './shop-buyer-contact.js';
import {orderProduct} from './shop-order-product.js';
import {shopPaymentReturnUrl} from './shop-payment-return-url.js';
import {shopTestWebhookPath} from './shop-test-webhook.js';
import {mollieFetch} from './mollie-request.js';
import {uuid} from './shop-drafts.js';
import {matchesShopPayment,customerId,paymentId,safeCheckoutUrl} from './shop-provider-proof.js';
import {shopError} from './shop-account.js';
export function createShopMollieTestAdapter({apiKey,publicOrigin,webhookEnabled=false,fetcher=fetch}){
 if(typeof apiKey!=='string'||!/^test_[A-Za-z0-9]+$/.test(apiKey))throw shopError('TEST_KEY_REQUIRED');
 if(typeof webhookEnabled!=='boolean')throw shopError('INVALID_WEBHOOK_CONFIG');
 let origin;try{const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{throw shopError('INVALID_PUBLIC_ORIGIN');}
 async function request(path,{body,key}={}){
  try{
   const response=await mollieFetch('https://api.mollie.com/v2/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+apiKey,...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})},fetcher);
   if(!response.ok)throw Error();return await response.json();
  }catch{throw shopError('PROVIDER_UNCERTAIN');}
 }
 return Object.freeze({
  async submit(command){
   const s=command;try{orderProduct(s);}catch{throw shopError('INVALID_PROVIDER_COMMAND');}
   if(!uuid(s?.orderId)||!uuid(s.companyId)||s.idempotencyKey!==s.orderId+':payment'||!validShopBuyerEmail(s.buyer?.email)||!validShopBuyerName(s.buyer?.name))throw shopError('INVALID_PROVIDER_COMMAND');
   const metadata={shopOrderId:s.orderId,shopCompanyId:s.companyId,shopPlanCode:s.planCode};let customer;
   if(s.period==='monthly'){
    const result=await request('customers',{key:s.orderId+':customer',body:{name:s.buyer.name||s.billing?.company_name||'Bringness Kunde',email:s.buyer.email,metadata}});
    if(result.resource!=='customer'||!customerId(result.id)||result.email!==s.buyer.email||Object.keys(metadata).some(k=>result.metadata?.[k]!==metadata[k]))throw shopError('PROVIDER_MISMATCH');customer=result.id;
   }
   const result=await request('payments',{key:s.idempotencyKey,body:{amount:{currency:'EUR',value:(s.grossCents/100).toFixed(2)},description:`Bringness Shop ${s.orderId}`,redirectUrl:shopPaymentReturnUrl(origin,s.orderId),metadata,...(webhookEnabled?{webhookUrl:origin+shopTestWebhookPath}:{}),sequenceType:s.period==='monthly'?'first':'oneoff',...(customer?{customerId:customer}:{})}});
   const expected={id:s.orderId,company_id:s.companyId,snapshot:s,provider_customer_id:customer};
   if(!matchesShopPayment(expected,result)||!['open','pending','authorized'].includes(result.status)||!safeCheckoutUrl(result._links?.checkout?.href))throw shopError('PROVIDER_MISMATCH');
   return result;
  },
  async fetchPayment(id){if(!paymentId(id))throw shopError('INVALID_REQUEST');const result=await request('payments/'+id);if(result.resource!=='payment'||result.id!==id||result.mode!=='test')throw shopError('PROVIDER_MISMATCH');return result;}
 });
}

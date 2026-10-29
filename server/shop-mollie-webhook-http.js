import {processShopMollieNotification} from './shop-mollie-notification-service.js';
// Explicitly unmounted. Integrators must add rate limiting to a dedicated endpoint
// and avoid logging raw request bodies, tokens, or provider responses.
export function createShopMollieWebhookHandler({pool,fetchProviderPayment,maxBytes=2048}){
 if(!pool||typeof fetchProviderPayment!=='function')throw Error('MOLLIE_WEBHOOK_NOT_CONFIGURED');
 return async function shopMollieWebhookHandler(req,res){
  if(req.method!=='POST'){res.statusCode=405;res.setHeader('Allow','POST');res.end();return;}
  if(req.headers?.['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/x-www-form-urlencoded'){
   res.statusCode=415;res.end();return;
  }
  let size=0;const chunks=[];
  try{
   for await(const chunk of req){size+=chunk.length;if(size>maxBytes){res.statusCode=413;res.end();return;}chunks.push(chunk);}
   await processShopMollieNotification({pool,body:Buffer.concat(chunks).toString('utf8'),fetchProviderPayment});
   res.statusCode=200;res.end();
  }catch(error){
   // Acknowledge unknown/invalid notifications without disclosing order existence.
   // Provider fetch or database failures should be retried by the provider.
   res.statusCode=/^(MOLLIE_WEBHOOK_|MOLLIE_WEBHOOK_PAYMENT_NOT_FOUND)/.test(error?.message||'')?200:503;
   res.end();
  }
 };
}

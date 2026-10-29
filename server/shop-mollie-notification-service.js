import {parseShopMollieWebhook,findShopPaymentByProviderReference} from './shop-mollie-webhook.js';
import {reconcileShopPayment} from './shop-payment-provider-sync.js';

// Server-only composition, NOT an exposed HTTP endpoint. The caller must enforce
// body limits, request throttling and provider API credentials before invocation.
// A webhook notification is never proof of payment; always fetch provider state.
export async function processShopMollieNotification({pool,body,fetchProviderPayment}){
 const {providerReference}=parseShopMollieWebhook(body);
 const {orderId,companyId}=await findShopPaymentByProviderReference(pool,providerReference);
 return reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment});
}

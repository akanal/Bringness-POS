import {providerEuroCents} from './provider-money.js';
export function billingPaymentMatches(tx,payment){
 try{
  if(!tx||!payment||payment.id!==tx.provider_payment_id||!['open','pending','authorized','paid','failed','expired','canceled'].includes(payment.status)||tx.currency!=='EUR'||providerEuroCents(payment.amount)!==tx.amount_cents)return false;
  if(tx.mollie_customer_id&&payment.customerId!==tx.mollie_customer_id)return false;
  if(tx.mollie_subscription_id&&payment.subscriptionId&&payment.subscriptionId!==tx.mollie_subscription_id)return false;
  if(payment.amountRefunded&&providerEuroCents(payment.amountRefunded)!==0||payment.amountChargedBack&&providerEuroCents(payment.amountChargedBack)!==0)return false;
  return true;
 }catch{return false;}
}

import {orderProduct} from './shop-order-product.js';
import {providerEuroCents} from './provider-money.js';
export const paymentId=id=>typeof id==='string'&&/^tr_[A-Za-z0-9]{1,100}$/.test(id);
export const customerId=id=>typeof id==='string'&&/^cst_[A-Za-z0-9]{1,100}$/.test(id);
export function safeCheckoutUrl(value){try{const u=new URL(value);return typeof value==='string'&&u.protocol==='https:'&&['www.mollie.com','checkout.mollie.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.hash&&!u.port;}catch{return false;}}
// Only trusted server-fetched provider objects reach this module; webhook/browser bodies
// must never be treated as provider evidence.
function matchesPayment(order,payment,mode){
 try{
  const s=orderProduct(order?.snapshot),m=payment?.metadata;if(order.provider_mode!=null&&order.provider_mode!==mode)return false;
  return Boolean(payment?.resource==='payment'&&payment.mode===mode&&paymentId(payment.id)&&(!order.provider_payment_id||payment.id===order.provider_payment_id)&&m?.shopOrderId===order.id&&m.shopCompanyId===order.company_id&&m.shopPlanCode===s.planCode&&providerEuroCents(payment.amount)===s.grossCents&&['open','pending','authorized','paid','failed','expired','canceled'].includes(payment.status)&&payment.sequenceType===(s.period==='monthly'?'first':'oneoff')&&!payment.subscriptionId&&(s.period!=='monthly'||customerId(payment.customerId))&&(!order.provider_customer_id||payment.customerId===order.provider_customer_id)&&(!payment.amountRefunded||providerEuroCents(payment.amountRefunded)===0)&&(!payment.amountChargedBack||providerEuroCents(payment.amountChargedBack)===0));
 }catch{return false;}
}

export const matchesShopPayment=(order,payment)=>matchesPayment(order,payment,'test');
export const matchesShopLivePayment=(order,payment)=>matchesPayment(order,payment,'live');

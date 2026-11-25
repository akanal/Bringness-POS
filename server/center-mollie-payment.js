import {providerEuroCents} from './provider-money.js';
import {molliePaymentReadUrl} from './center-mollie-mode.js';
import {withMerchantToken} from './center-mollie-merchant.js';
import {releaseCenterPayment} from './center-payment-release.js';
export const eurCents=providerEuroCents;
export function normalizeMolliePayment(payment,credential){
 if(payment.profileId!==credential.profile_id||!credential.verified_at)throw Error('PAYMENT_PROFILE_MISMATCH');
 return {paymentId:payment.id,orderId:payment.metadata?.bringnessOrderId,merchantReference:credential.organization_id,
 amountCents:eurCents(payment.amount),currency:payment.amount.currency,status:payment.status,paidAt:payment.paidAt,
 refundedCents:payment.amountRefunded?eurCents(payment.amountRefunded):0,
 chargedBackCents:payment.amountChargedBack?eurCents(payment.amountChargedBack):0};
}
export async function verifyAndReleaseMolliePayment(pool,paymentId,env=process.env,fetcher=fetch){
 if(!/^tr_[a-zA-Z0-9]+$/.test(paymentId||''))return {released:false,reason:'invalid_payment_id'};
 const binding=(await pool.query('SELECT p.restaurant_id,a.request_payload FROM center_order_payments p JOIN center_checkout_attempts a ON a.payment_id=p.payment_id WHERE p.payment_id=$1',[paymentId])).rows[0];
 if(!binding)return {released:false,reason:'unknown_payment'};
 return releaseCenterPayment(pool,paymentId,()=>readMerchantPayment(pool,binding,paymentId,env,fetcher));
}

function readMerchantPayment(pool,binding,paymentId,env,fetcher){
 return withMerchantToken(pool,binding.restaurant_id,async(accessToken,envelope)=>{
  const credential=(await pool.query('SELECT profile_id,organization_id,verified_at FROM center_mollie_credentials WHERE restaurant_id=$1 AND token_envelope=$2',[binding.restaurant_id,envelope])).rows[0];
  if(!credential)throw Error('MERCHANT_CONNECTION_CHANGED');
  const mode=binding.request_payload?.testmode===true?'test':'live';
  const response=await fetcher(molliePaymentReadUrl('/v2/payments/'+paymentId,mode).href,{
   headers:{authorization:'Bearer '+accessToken,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('PAYMENT_READ_FAILED');
  return normalizeMolliePayment(await response.json(),credential);
 },env,fetcher);
}

export async function readCenterRefundOverview(pool,companyId,orderId,env=process.env,fetcher=fetch){
 const binding=(await pool.query(`SELECT cp.payment_id,cp.restaurant_id,cp.merchant_reference,cp.amount_cents,a.request_payload
  FROM center_order_payments cp JOIN orders o ON o.id=cp.order_id AND o.restaurant_id=cp.restaurant_id
  JOIN restaurants r ON r.id=o.restaurant_id
  JOIN center_checkout_attempts a ON a.order_id=o.id AND a.payment_id=cp.payment_id AND a.restaurant_id=r.id
  WHERE o.id=$1 AND r.company_id=$2 AND o.source='center' AND cp.payment_method='online'
  AND cp.released_at IS NOT NULL AND cp.paid_at IS NOT NULL`,[orderId,companyId])).rows[0];
 if(!binding)return null;
 if(!/^tr_[a-zA-Z0-9]+$/.test(binding.payment_id)||typeof binding.request_payload?.testmode!=='boolean'){
  throw Error('PAYMENT_BINDING_INVALID');
 }
 const payment=await readMerchantPayment(pool,binding,binding.payment_id,env,fetcher);
 if(payment.paymentId!==binding.payment_id||payment.orderId!==orderId||
    payment.merchantReference!==binding.merchant_reference||payment.amountCents!==binding.amount_cents){
  throw Error('PAYMENT_BINDING_MISMATCH');
 }
 return {orderId,mode:binding.request_payload.testmode?'test':'live',
  paidCents:payment.amountCents,refundedCents:payment.refundedCents,chargedBackCents:payment.chargedBackCents,currency:payment.currency};
}

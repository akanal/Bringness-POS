import {withMerchantToken} from './center-mollie-merchant.js';
import {releaseCenterPayment} from './center-payment-release.js';
export function eurCents(amount){
 if(amount?.currency!=='EUR'||typeof amount.value!=='string'||!/^\d+\.\d{2}$/.test(amount.value))throw Error('INVALID_EUR_AMOUNT');
 const [whole,fraction]=amount.value.split('.');const cents=Number(whole)*100+Number(fraction);
 if(!Number.isSafeInteger(cents))throw Error('INVALID_EUR_AMOUNT');return cents;
}
export function normalizeMolliePayment(payment,credential){
 if(payment.profileId!==credential.profile_id||!credential.verified_at)throw Error('PAYMENT_PROFILE_MISMATCH');
 return {paymentId:payment.id,orderId:payment.metadata?.bringnessOrderId,merchantReference:credential.organization_id,
 amountCents:eurCents(payment.amount),currency:payment.amount.currency,status:payment.status,paidAt:payment.paidAt,
 refundedCents:payment.amountRefunded?eurCents(payment.amountRefunded):0,
 chargedBackCents:payment.amountChargedBack?eurCents(payment.amountChargedBack):0};
}
export async function verifyAndReleaseMolliePayment(pool,paymentId,env=process.env,fetcher=fetch){
 if(!/^tr_[a-zA-Z0-9]+$/.test(paymentId||''))return {released:false,reason:'invalid_payment_id'};
 const binding=(await pool.query('SELECT restaurant_id FROM center_order_payments WHERE payment_id=$1',[paymentId])).rows[0];
 if(!binding)return {released:false,reason:'unknown_payment'};
 return releaseCenterPayment(pool,paymentId,async()=>withMerchantToken(pool,binding.restaurant_id,async(accessToken,envelope)=>{
 const credential=(await pool.query('SELECT profile_id,organization_id,verified_at FROM center_mollie_credentials WHERE restaurant_id=$1 AND token_envelope=$2',[binding.restaurant_id,envelope])).rows[0];
 if(!credential)throw Error('MERCHANT_CONNECTION_CHANGED');
 const response=await fetcher('https://api.mollie.com/v2/payments/'+paymentId,{headers:{authorization:'Bearer '+accessToken,accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('PAYMENT_READ_FAILED');return normalizeMolliePayment(await response.json(),credential);
 },env,fetcher));
}

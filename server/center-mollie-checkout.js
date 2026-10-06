import {withMerchantToken} from './center-mollie-merchant.js';
import {eurCents} from './center-mollie-payment.js';
export async function createCenterMollieCheckout(pool,attemptId,env=process.env,fetcher=fetch){
 const origin=new URL(env.CENTER_PAYMENT_ORIGIN||'http://invalid');if(origin.protocol!=='https:')throw Error('PAYMENT_ORIGIN_MISSING');
 const attempt=(await pool.query(`SELECT a.*,o.total_cents,o.status,cr.merchant_reference,cr.contract_status,cr.payment_status,cr.active
 FROM center_checkout_attempts a JOIN orders o ON o.id=a.order_id
 JOIN center_restaurants cr ON cr.restaurant_id=a.restaurant_id AND cr.center_id=a.center_id
 WHERE a.id=$1 AND o.restaurant_id=a.restaurant_id`,[attemptId])).rows[0];
 if(!attempt)throw Error('CHECKOUT_NOT_FOUND');
 if(attempt.checkout_url)return {checkoutUrl:attempt.checkout_url,alreadyCreated:true};
 if(attempt.attempted_at)return {pending:true,reconciliationRequired:true};
 if(attempt.status!=='payment_pending'||!attempt.active||attempt.contract_status!=='signed'||attempt.payment_status!=='verified')throw Error('CHECKOUT_NOT_READY');
 if(!Number.isSafeInteger(attempt.total_cents)||attempt.total_cents<=0)throw Error('INVALID_CHECKOUT_AMOUNT');
 return withMerchantToken(pool,attempt.restaurant_id,async(accessToken,envelope)=>{
 const credential=(await pool.query('SELECT * FROM center_mollie_credentials WHERE restaurant_id=$1 AND token_envelope=$2',[attempt.restaurant_id,envelope])).rows[0];
 if(!credential?.verified_at||credential.organization_id!==attempt.merchant_reference)throw Error('MERCHANT_NOT_VERIFIED');
 const payload={amount:{currency:'EUR',value:(attempt.total_cents/100).toFixed(2)},description:'Bringness Bestellung '+attempt.order_id,
 profileId:credential.profile_id,metadata:{bringnessOrderId:attempt.order_id,bringnessCheckoutId:attempt.id},
 redirectUrl:new URL('/center/status.html#token='+attempt.guest_status_token,origin).href,
 webhookUrl:new URL('/api/v1/centers/mollie/webhook',origin).href};
 // Claim BEFORE the external request. A lost response needs reconciliation, not a
 // blind retry: Mollie idempotency keys expire and are tied to OAuth credentials.
 const claim=await pool.query('UPDATE center_checkout_attempts SET attempted_at=now(),request_payload=$2::jsonb WHERE id=$1 AND attempted_at IS NULL RETURNING id',[attempt.id,JSON.stringify(payload)]);
 if(!claim.rows.length)return {pending:true,reconciliationRequired:true};
 const response=await fetcher('https://api.mollie.com/v2/payments',{method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json','Idempotency-Key':attempt.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('PAYMENT_CREATION_UNCONFIRMED');
 const payment=await response.json();const checkoutUrl=payment._links?.checkout?.href;
 if(!/^tr_[a-zA-Z0-9]+$/.test(payment.id||'')||payment.profileId!==credential.profile_id||eurCents(payment.amount)!==attempt.total_cents||payment.metadata?.bringnessOrderId!==attempt.order_id)throw Error('PAYMENT_CREATION_MISMATCH');
 const target=new URL(checkoutUrl);if(target.protocol!=='https:'||!(target.hostname==='mollie.com'||target.hostname.endsWith('.mollie.com')))throw Error('INVALID_CHECKOUT_URL');
 await pool.query(`WITH bound AS (INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency,guest_status_token)
 VALUES($1,$2,$3,$4,$5,$6,'EUR',$7) RETURNING order_id)
 UPDATE center_checkout_attempts a SET payment_id=$1,checkout_url=$8 FROM bound WHERE a.order_id=bound.order_id`,[payment.id,attempt.order_id,attempt.center_id,attempt.restaurant_id,credential.organization_id,attempt.total_cents,attempt.guest_status_token,checkoutUrl]);
 return {checkoutUrl};
 },env,fetcher);
}

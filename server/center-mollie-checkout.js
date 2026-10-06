import {molliePaymentMode,molliePaymentReadUrl} from './center-mollie-mode.js';
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
 profileId:credential.profile_id,testmode:molliePaymentMode(env)==='test',metadata:{bringnessOrderId:attempt.order_id,bringnessCheckoutId:attempt.id},
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
export function matchingCheckoutPayments(payments,attempt){
 return payments.filter(p=>p.metadata?.bringnessCheckoutId===attempt.id&&p.metadata?.bringnessOrderId===attempt.order_id
 &&p.profileId===attempt.request_payload.profileId&&eurCents(p.amount)===attempt.total_cents);
}
export async function reconcileCenterCheckout(pool,attemptId,env=process.env,fetcher=fetch){
 const origin=new URL(env.CENTER_PAYMENT_ORIGIN||'http://invalid');if(origin.protocol!=='https:')throw Error('PAYMENT_ORIGIN_MISSING');
 const attempt=(await pool.query(`SELECT a.*,o.total_cents FROM center_checkout_attempts a JOIN orders o ON o.id=a.order_id WHERE a.id=$1`,[attemptId])).rows[0];
 if(!attempt?.attempted_at||!attempt.request_payload)throw Error('NO_PAYMENT_ATTEMPT');
 if(attempt.payment_id)return {reconciled:true,paymentId:attempt.payment_id};
 return withMerchantToken(pool,attempt.restaurant_id,async(accessToken,envelope)=>{
 const credential=(await pool.query('SELECT * FROM center_mollie_credentials WHERE restaurant_id=$1 AND token_envelope=$2',[attempt.restaurant_id,envelope])).rows[0];
 if(!credential?.verified_at||credential.profile_id!==attempt.request_payload.profileId)throw Error('MERCHANT_CONNECTION_CHANGED');
 const mode=attempt.request_payload.testmode===true?'test':'live';
 let url=molliePaymentReadUrl('/v2/payments',mode);url.searchParams.set('profileId',credential.profile_id);url.searchParams.set('limit','250');
 const matches=[];
 for(let page=0;url&&page<10;page++){
 if(url.origin!=='https://api.mollie.com'||url.pathname!=='/v2/payments')throw Error('INVALID_PAYMENT_PAGE');
 url=molliePaymentReadUrl(url.href,mode);
 const response=await fetcher(url.href,{headers:{authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('PAYMENT_RECONCILIATION_FAILED');
 const data=await response.json();if(!Array.isArray(data._embedded?.payments))throw Error('INVALID_PAYMENT_LIST');
 matches.push(...matchingCheckoutPayments(data._embedded.payments,attempt));
 url=data._links?.next?.href?new URL(data._links.next.href):null;
 }
 if(url)return {reconciled:false,reason:'scan_incomplete',retryCreationAllowed:false};
 if(matches.length!==1)return {reconciled:false,reason:matches.length?'ambiguous_payment':'payment_not_found',retryCreationAllowed:false};
 const payment=matches[0];if(!/^tr_[a-zA-Z0-9]+$/.test(payment.id||''))throw Error('INVALID_PAYMENT_ID');
 let checkoutUrl=payment._links?.checkout?.href;
 if(checkoutUrl){const target=new URL(checkoutUrl);if(target.protocol!=='https:'||!(target.hostname==='mollie.com'||target.hostname.endsWith('.mollie.com')))throw Error('INVALID_CHECKOUT_URL');}
 else checkoutUrl=new URL('/center/status.html#token='+attempt.guest_status_token,origin).href;
 const client=await pool.connect();try{
 await client.query('BEGIN');const locked=(await client.query('SELECT payment_id FROM center_checkout_attempts WHERE id=$1 FOR UPDATE',[attemptId])).rows[0];
 if(locked.payment_id){await client.query('COMMIT');return {reconciled:true,paymentId:locked.payment_id};}
 await client.query(`INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency,guest_status_token)
 VALUES($1,$2,$3,$4,$5,$6,'EUR',$7)`,[payment.id,attempt.order_id,attempt.center_id,attempt.restaurant_id,credential.organization_id,attempt.total_cents,attempt.guest_status_token]);
 await client.query('UPDATE center_checkout_attempts SET payment_id=$2,checkout_url=$3 WHERE id=$1',[attemptId,payment.id,checkoutUrl]);
 await client.query('COMMIT');return {reconciled:true,paymentId:payment.id,checkoutUrl};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 },env,fetcher);
}

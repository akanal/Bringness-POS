import {verifyDownloadConsent} from './shop-download-consent.js';
import {orderProduct} from './shop-order-product.js';
import {validShopBuyerEmail,validShopBuyerName} from './shop-buyer-contact.js';
import {lockShopPaymentGuard} from './shop-payment-guard.js';
import {enqueueShopTestPayment} from './shop-test-payment-queue.js';
import {uuid} from './shop-drafts.js';
import {shopActor,loadShopPreview,shopError} from './shop-account.js';
import {matchesShopPayment,safeCheckoutUrl} from './shop-provider-proof.js';
const publicResult=row=>({id:row.id,status:row.status,canPay:false,canActivate:false,checkoutConnected:false});
export async function lockShopOrder(db,id){
 const reference=(await db.query('SELECT company_id FROM shop_checkout_orders WHERE id=$1',[id])).rows[0];if(!reference)throw shopError('CHECKOUT_NOT_FOUND');
 await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[reference.company_id]);
 const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!order||order.company_id!==reference.company_id)throw shopError('ACCOUNT_CHANGED');return order;
}
export async function attachVerifiedShopPayment(pool,{id,payment}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const order=await lockShopOrder(db,id);
  const url=payment?._links?.checkout?.href;
  if(!matchesShopPayment(order,payment)||!['open','pending','authorized'].includes(payment.status)||!safeCheckoutUrl(url))throw shopError('PROVIDER_MISMATCH');
  if(order.status==='open'&&order.provider_payment_id===payment.id&&order.checkout_url===url){await lockShopPaymentGuard(db,order,{state:'open',paymentId:payment.id});await db.query("UPDATE shop_checkout_orders SET provider_mode='test' WHERE id=$1",[id]);await enqueueShopTestPayment(db,payment.id);await db.query('COMMIT');return publicResult(order);}
  if(order.status!=='uncertain'||!order.dispatch_started_at)throw shopError('CHECKOUT_PENDING');
  const guard=await lockShopPaymentGuard(db,order,{state:'creating'});
  await db.query("UPDATE billing_checkout_guards SET status='open',provider_payment_id=$3 WHERE company_id=$1 AND id=$2",[order.company_id,guard.id,payment.id]);
  const updated=(await db.query("UPDATE shop_checkout_orders SET status='open',provider_payment_id=$2,checkout_url=$3,provider_customer_id=$4,provider_status=$5,provider_mode='test' WHERE id=$1 RETURNING *",[id,payment.id,url,payment.customerId||null,payment.status])).rows[0];
  await enqueueShopTestPayment(db,payment.id);await db.query('COMMIT');return publicResult(updated);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
// Internal-only: deliberately no HTTP route, worker, timer, or production adapter.
// The durable uncertain state commits BEFORE any provider call. It is never aged
// out or automatically retried, even beyond the provider's idempotency window.
export async function dispatchPreparedShopCheckout(pool,{id,submit}){
 if(!uuid(id)||typeof submit!=='function')throw shopError('INVALID_REQUEST');const db=await pool.connect();let command;
 try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const order=await lockShopOrder(db,id);
  if(order.status!=='prepared'||order.dispatch_started_at||order.provider_payment_id)throw shopError('CHECKOUT_PENDING');
  if(!/^[0-9a-f]{64}$/.test(order.session_hash||''))throw shopError('UNAUTHORIZED');
  const actor=await shopActor(db,order.session_hash,true);if(actor.company_id!==order.company_id)throw shopError('ACCOUNT_CHANGED');
  const guard=await lockShopPaymentGuard(db,order,{state:'creating'});
  const draft=(await db.query('SELECT status,expires_at FROM shop_order_drafts WHERE company_id=$1 AND id=$2 FOR UPDATE',[order.company_id,order.draft_id])).rows[0];
  if(!draft||draft.status!=='draft')throw shopError('DRAFT_INELIGIBLE');
  const s=orderProduct(order.snapshot),quote=await loadShopPreview(db,order.company_id,{[s.productId]:1},{excludeGuardId:guard.id}),line=quote.lines[0];
  const billing=(await db.query('SELECT company_name,street,postal_code,city,country FROM company_billing_profiles WHERE company_id=$1',[order.company_id])).rows[0];
  const buyer=(await db.query('SELECT u.email,u.display_name AS name FROM sessions se JOIN users u ON u.id=se.user_id WHERE se.token_hash=$1',[order.session_hash])).rows[0];
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
  if(quote.issues.length||!line||['productId','planCode','period','netCents','vatCents','grossCents'].some(k=>line[k]!==s[k])||s.currency!=='EUR'||new Date(draft.expires_at)<=new Date(now))throw shopError('PRICE_CHANGED');
  if(!billing||!order.billing_snapshot||Object.keys(billing).some(k=>billing[k]!==order.billing_snapshot[k]))throw shopError('PROFILE_CHANGED');
  if(!buyer||!validShopBuyerEmail(buyer.email)||!validShopBuyerName(buyer.name))throw shopError('PROFILE_CHANGED');
  const finalActor=await shopActor(db,order.session_hash,true);if(finalActor.company_id!==order.company_id)throw shopError('ACCOUNT_CHANGED');
  const dispatchTime=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;if(new Date(draft.expires_at)<=new Date(dispatchTime)||new Date(quote.expiresAt)<=new Date(dispatchTime))throw shopError('DRAFT_INELIGIBLE');
  if(s.productId==='pos-download'){
   const table=(await db.query("SELECT to_regclass('shop_download_invoice_consents') AS relation")).rows[0]?.relation;
   if(!table)throw shopError('INVOICE_CONSENT_REQUIRED');
   const consent=(await db.query('SELECT * FROM shop_download_invoice_consents WHERE checkout_id=$1 FOR SHARE',[id])).rows[0];
   verifyDownloadConsent(consent,order);
   const acceptanceNow=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
   const acceptedAt=new Date(consent.created_at).getTime(),at=new Date(acceptanceNow).getTime();
   if(new Date(draft.expires_at).getTime()<=at||new Date(quote.expiresAt).getTime()<=at)throw shopError('DRAFT_INELIGIBLE');
   if(acceptedAt<new Date(order.created_at).getTime()||acceptedAt>at||new Date(consent.consent_expires_at).getTime()<=at)throw shopError('INVOICE_CONSENT_REQUIRED');
  }
  command=Object.freeze({orderId:order.id,companyId:order.company_id,idempotencyKey:order.id+':payment',...s,buyer:Object.freeze({...buyer}),billing:Object.freeze({...order.billing_snapshot})});
  await db.query("UPDATE shop_checkout_orders SET status='uncertain',dispatch_started_at=clock_timestamp() WHERE id=$1",[id]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 let payment;try{payment=await submit(command);}catch{throw shopError('PROVIDER_UNCERTAIN');}
 return attachVerifiedShopPayment(pool,{id,payment});
}

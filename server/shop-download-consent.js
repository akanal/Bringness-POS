import crypto from 'node:crypto';
import {uuid} from './shop-drafts.js';
import {shopActor,sessionHash,shopError,loadShopPreview} from './shop-account.js';
import {lockShopOrder} from './shop-checkout-dispatch.js';
import {downloadSeller,downloadSnapshot,berlinInvoiceDate,allowDownloadPdf} from './shop-download-policy.js';

export const downloadConsentVersion='pdf-domestic-b2b-v1';
export const downloadConsentText='Ich stimme zu, die Rechnung für diesen Kauf elektronisch im PDF-Format zu erhalten.';
// Content binding, not proof that a person viewed or accepted a screen. Only an
// explicit future protected confirmation may submit accepted=true.
export function downloadConsentDigest({id,seller,product,buyer,expiresAt}){
 return crypto.createHash('sha256').update(JSON.stringify({version:downloadConsentVersion,text:downloadConsentText,id,seller:downloadSeller(seller),...downloadSnapshot({snapshot:product,billing_snapshot:buyer}),expiresAt:new Date(expiresAt).toISOString()})).digest('hex');
}
export function sameDownloadValue(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameDownloadValue(a[k],b[k]));}
async function presentation(db,order,seller){
 const issuer=downloadSeller(seller),snapshots=downloadSnapshot(order);
 const draft=(await db.query('SELECT status,expires_at,snapshot FROM shop_order_drafts WHERE company_id=$1 AND id=$2',[order.company_id,order.draft_id])).rows[0];
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
 if(order.status!=='prepared'||order.dispatch_started_at||order.provider_payment_id)throw shopError('CHECKOUT_PENDING');
 if(!draft||draft.status!=='draft'||new Date(draft.expires_at)<=new Date(now))throw shopError('DRAFT_INELIGIBLE');
 allowDownloadPdf({date:berlinInvoiceDate(now),consent:true});
 const current=(await db.query('SELECT company_name,street,postal_code,city,country FROM company_billing_profiles WHERE company_id=$1',[order.company_id])).rows[0];
 if(!sameDownloadValue(current,snapshots.buyer))throw shopError('PROFILE_CHANGED');
 const quote=await loadShopPreview(db,order.company_id,{'pos-download':1},{excludeGuardId:order.guard_id}),line=quote.lines[0],original=draft.snapshot?.lines?.[0];
 if(quote.issues.length||!line||draft.snapshot?.lines?.length!==1||original?.quantity!==1||['productId','planCode','period','netCents','vatCents','grossCents'].some(k=>line[k]!==snapshots.product[k]||original[k]!==snapshots.product[k]))throw shopError('PRICE_CHANGED');
 const result={id:order.id,version:downloadConsentVersion,text:downloadConsentText,seller:issuer,...snapshots,expiresAt:new Date(draft.expires_at).toISOString(),accepted:false,canPay:false,canActivate:false,checkoutConnected:false};
 return {...result,digest:downloadConsentDigest(result)};
}
export async function readShopDownloadInvoiceConsent(pool,{token,id,seller}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);
  const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE id=$1 AND company_id=$2',[id,actor.company_id])).rows[0];if(!order)throw shopError('CHECKOUT_NOT_FOUND');
  const view=await presentation(db,order,seller);await db.query('COMMIT');return view;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function recordShopDownloadInvoiceConsent(pool,{token,id,seller,accepted=false,acceptedDigest}){
 if(!uuid(id)||accepted!==true)throw shopError('INVOICE_CONSENT_REQUIRED');const issuer=downloadSeller(seller),hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const order=await lockShopOrder(db,id),actor=await shopActor(db,hash,true);
  if(actor.company_id!==order.company_id)throw shopError('CHECKOUT_NOT_FOUND');
  const old=(await db.query('SELECT * FROM shop_download_invoice_consents WHERE checkout_id=$1 FOR UPDATE',[id])).rows[0];
  if(old){
   if(old.company_id!==order.company_id||!sameDownloadValue(old.seller_snapshot,issuer)||!sameDownloadValue(old.order_snapshot,order.snapshot)||!sameDownloadValue(old.buyer_snapshot,downloadSnapshot(order).buyer)||old.consent_version!==downloadConsentVersion||!old.consent_digest||old.consent_digest!==acceptedDigest)throw shopError('REQUEST_CONFLICT');
   await db.query('COMMIT');return {id,recorded:true,replay:true};
  }
  const view=await presentation(db,order,issuer);
  if(typeof acceptedDigest!=='string'||!/^[a-f0-9]{64}$/.test(acceptedDigest)||acceptedDigest!==view.digest)throw shopError('INVOICE_CONSENT_CHANGED');
  // One database clock value decides eligibility and records acceptance time.
  const inserted=await db.query('WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS now) INSERT INTO shop_download_invoice_consents(checkout_id,company_id,session_hash,seller_snapshot,order_snapshot,buyer_snapshot,consent_digest,consent_expires_at,consent_version,created_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,stamp.now FROM stamp WHERE stamp.now<$8::timestamptz RETURNING checkout_id',[id,order.company_id,hash,JSON.stringify(issuer),JSON.stringify(view.product),JSON.stringify(view.buyer),view.digest,view.expiresAt,downloadConsentVersion]);
  if(!inserted.rows.length)throw shopError('DRAFT_INELIGIBLE');
  await db.query('COMMIT');return {id,recorded:true,replay:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

export function verifyDownloadConsent(consent,order){
 const snapshots=downloadSnapshot(order);
 if(!consent||consent.checkout_id!==order.id||consent.company_id!==order.company_id||consent.consent_version!==downloadConsentVersion||!sameDownloadValue(consent.order_snapshot,snapshots.product)||!sameDownloadValue(consent.buyer_snapshot,snapshots.buyer)||!consent.consent_expires_at||!consent.created_at||!Number.isFinite(new Date(consent.created_at).getTime())||!Number.isFinite(new Date(consent.consent_expires_at).getTime())||new Date(consent.created_at)>=new Date(consent.consent_expires_at))throw shopError('INVOICE_CONSENT_REQUIRED');
 let digest;try{digest=downloadConsentDigest({id:order.id,seller:consent.seller_snapshot,...snapshots,expiresAt:consent.consent_expires_at});}catch{throw shopError('INVOICE_CONSENT_REQUIRED');}
 if(consent.consent_digest!==digest)throw shopError('INVOICE_CONSENT_REQUIRED');return downloadSeller(consent.seller_snapshot);
}

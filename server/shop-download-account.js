import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {verifyDownloadConsent,downloadConsentVersion} from './shop-download-consent.js';
import {downloadSnapshot} from './shop-download-policy.js';
import {loadDownloadInvoiceRecords,verifyDownloadInvoiceRecords} from './shop-download-invoice.js';

async function accountRead(pool,{token,id},read){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);
  const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE id=$1 AND company_id=$2',[id,actor.company_id])).rows[0];if(!order)throw shopError('CHECKOUT_NOT_FOUND');downloadSnapshot(order);
  const result=await read(db,order);await db.query('COMMIT');return {...result,canPay:false,canActivate:false,checkoutConnected:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function readShopDownloadConsentReceipt(pool,request){
 return accountRead(pool,request,async(db,order)=>{
  const consent=(await db.query('SELECT * FROM shop_download_invoice_consents WHERE checkout_id=$1',[order.id])).rows[0];
  if(!consent)return {id:order.id,recorded:false};
  const seller=verifyDownloadConsent(consent,order);
  return {id:order.id,recorded:true,version:downloadConsentVersion,digest:consent.consent_digest,acceptedAt:new Date(consent.created_at).toISOString(),expiresAt:new Date(consent.consent_expires_at).toISOString(),seller,...downloadSnapshot(order)};
 });
}
export async function readShopDownloadPurchaseStatus(pool,request){
 return accountRead(pool,request,async(db,order)=>{
  const record=(await db.query('SELECT * FROM shop_download_fulfilments WHERE checkout_id=$1 AND company_id=$2',[order.id,order.company_id])).rows[0];let invoicePreviewAvailable=false;
  if(record){verifyDownloadInvoiceRecords(await loadDownloadInvoiceRecords(db,order,record));invoicePreviewAvailable=true;}
  return {id:order.id,status:order.status,paymentMode:order.provider_mode||'none',licence:'blocked',invoicePreviewAvailable,invoiceDelivered:false,purchaseCompleted:false};
 });
}

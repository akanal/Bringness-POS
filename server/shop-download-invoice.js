import crypto from 'node:crypto';
import {shopError,shopActor,sessionHash} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {downloadSnapshot,downloadSeller} from './shop-download-policy.js';
import {verifyDownloadConsent,sameDownloadValue as same} from './shop-download-consent.js';

export const downloadInvoiceDescription='Bringness POS für Windows – einmalige Basislizenz';
const fail=()=>{throw shopError('FULFILMENT_MISMATCH');};
export function invoiceCalendarDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return fail();
 const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)return fail();return value;
}
// A whitelisted deterministic model. Neither current profile nor environment
// variables participate in historical document rendering.
export function downloadInvoiceModel(snapshot){
 if(!snapshot||snapshot.version!==1||!uuid(snapshot.checkoutId)||snapshot.quantity!==1||snapshot.vatRate!==19||snapshot.description!==downloadInvoiceDescription)return fail();
 const invoiceDate=invoiceCalendarDate(snapshot.invoiceDate),serviceDate=invoiceCalendarDate(snapshot.serviceDate);
 if(serviceDate>invoiceDate||typeof snapshot.invoiceNumber!=='string'||!/^BN-\d{4}-\d{6,20}$/.test(snapshot.invoiceNumber)||snapshot.invoiceNumber.slice(3,7)!==invoiceDate.slice(0,4))return fail();
 const seller=downloadSeller(snapshot.seller),snapshots=downloadSnapshot({snapshot:snapshot.product,billing_snapshot:snapshot.buyer});
 return {version:1,checkoutId:snapshot.checkoutId,invoiceNumber:snapshot.invoiceNumber,invoiceDate,serviceDate,description:downloadInvoiceDescription,quantity:1,vatRate:19,seller,...snapshots};
}
export function downloadInvoiceDigest(snapshot){return crypto.createHash('sha256').update(JSON.stringify(downloadInvoiceModel(snapshot))).digest('hex');}
const sqlDate=value=>value instanceof Date?value.toISOString().slice(0,10):value;
export function verifyDownloadInvoiceRecords({order,consent,record,invoice,entitlement,job,guard,plan}){
 const seller=verifyDownloadConsent(consent,order),snapshots=downloadSnapshot(order),model=downloadInvoiceModel(record?.snapshot);
 if(!plan||order.provider_mode!=='live'||order.status!=='paid'||order.provider_status!=='paid'||record.checkout_id!==order.id||record.company_id!==order.company_id||record.provider_payment_id!==order.provider_payment_id||record.document_digest!==downloadInvoiceDigest(model)||record.invoice_number!==model.invoiceNumber||model.checkoutId!==order.id||!same(model.product,snapshots.product)||!same(model.buyer,snapshots.buyer)||!same(model.seller,seller))return fail();
 if(!invoice||record.billing_transaction_id!==invoice.id||invoice.company_id!==order.company_id||invoice.plan_id!==plan.id||invoice.provider!=='mollie'||invoice.provider_payment_id!==order.provider_payment_id||invoice.status!=='paid'||invoice.currency!=='EUR'||invoice.invoice_number!==model.invoiceNumber||sqlDate(invoice.invoice_date)!==model.invoiceDate||invoice.amount_cents!==model.product.grossCents||invoice.net_cents!==model.product.netCents||invoice.vat_cents!==model.product.vatCents||Number(invoice.vat_rate)!==19||!same(invoice.billing_snapshot,model.buyer)||!invoice.paid_at||!Number.isFinite(new Date(invoice.paid_at).getTime()))return fail();
 if(!entitlement||entitlement.id!==record.entitlement_id||entitlement.company_id!==order.company_id||entitlement.plan_id!==plan.id||entitlement.provider!=='mollie'||entitlement.provider_reference!==order.provider_payment_id||entitlement.current_period_end!==null||!entitlement.purchased_at||!Number.isFinite(new Date(entitlement.purchased_at).getTime()))return fail();
 if(!job||job.company_id!==order.company_id||job.checkout_id!==order.id||job.status!=='done'||job.plan_code!=='download_license'||job.provider_payment_id!==order.provider_payment_id||!guard||guard.id!==order.guard_id||guard.company_id!==order.company_id||guard.plan_id!==plan.id||guard.slot!=='base'||guard.status!=='resolved'||guard.provider_payment_id!==order.provider_payment_id)return fail();
 return model;
}

export async function loadDownloadInvoiceRecords(db,order,record){
 const invoice=(await db.query('SELECT * FROM billing_transactions WHERE id=$1',[record.billing_transaction_id])).rows[0];
 const entitlement=(await db.query('SELECT * FROM company_entitlements WHERE id=$1',[record.entitlement_id])).rows[0];
 const consent=(await db.query('SELECT * FROM shop_download_invoice_consents WHERE checkout_id=$1',[order.id])).rows[0];
 const job=(await db.query('SELECT * FROM shop_license_jobs WHERE checkout_id=$1',[order.id])).rows[0];
 const guard=(await db.query('SELECT * FROM billing_checkout_guards WHERE id=$1 AND company_id=$2',[order.guard_id,order.company_id])).rows[0];
 const plan=(await db.query("SELECT id FROM billing_plans WHERE code='download_license'")).rows[0];
 return {order,record,invoice,entitlement,consent,job,guard,plan};
}
// Account reader for internal/candidate routing: no production mount, mail or provider call. Historical
// invoice access survives entitlement revocation; it never reactivates a licence.
export async function readShopDownloadInvoicePreview(pool,{token,id}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);
  const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE id=$1 AND company_id=$2',[id,actor.company_id])).rows[0];if(!order)throw shopError('CHECKOUT_NOT_FOUND');
  const record=(await db.query('SELECT * FROM shop_download_fulfilments WHERE checkout_id=$1 AND company_id=$2',[id,actor.company_id])).rows[0];if(!record)throw shopError('INVOICE_NOT_READY');
  const facts=await loadDownloadInvoiceRecords(db,order,record),snapshot=verifyDownloadInvoiceRecords(facts);
  const view={kind:'invoice_preview',label:'Vorschau – keine ausgestellte Rechnung',snapshot,digest:downloadInvoiceDigest(snapshot),invoiceDelivered:false,checkoutConnected:false,canPay:false,canActivate:false};
  await db.query('COMMIT');return view;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

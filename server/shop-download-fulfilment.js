import crypto from 'node:crypto';
import {uuid} from './shop-drafts.js';
import {shopError,requireNoPendingBilling} from './shop-account.js';
import {lockShopOrder} from './shop-checkout-dispatch.js';
import {matchesShopLivePayment} from './shop-provider-proof.js';
import {downloadSnapshot,berlinInvoiceDate,allowDownloadPdf} from './shop-download-policy.js';

import {verifyDownloadConsent} from './shop-download-consent.js';
import {downloadInvoiceDescription,downloadInvoiceDigest,loadDownloadInvoiceRecords,verifyDownloadInvoiceRecords} from './shop-download-invoice.js';
export {recordShopDownloadInvoiceConsent,readShopDownloadInvoiceConsent} from './shop-download-consent.js';

export async function migrateShopDownloadConsent(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_download_invoice_consents(
  checkout_id uuid PRIMARY KEY REFERENCES shop_checkout_orders(id),company_id uuid NOT NULL REFERENCES companies(id),
  session_hash text NOT NULL,seller_snapshot jsonb NOT NULL,order_snapshot jsonb NOT NULL,
  buyer_snapshot jsonb NOT NULL,consent_digest text NOT NULL CHECK(consent_digest ~ '^[a-f0-9]{64}$'),consent_expires_at timestamptz NOT NULL,
  consent_version text NOT NULL CHECK(consent_version='pdf-domestic-b2b-v1'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 )`);
 // Existing immutable consents are not backfilled: incomplete legacy rows fail closed.
 for(const column of ['buyer_snapshot jsonb','consent_digest text','consent_expires_at timestamptz'])await db.query('ALTER TABLE shop_download_invoice_consents ADD COLUMN IF NOT EXISTS '+column);
 await db.query("CREATE OR REPLACE FUNCTION shop_download_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SHOP_DOWNLOAD_IMMUTABLE'; END; $$");
 await db.query('CREATE OR REPLACE TRIGGER shop_download_invoice_consents_immutable BEFORE UPDATE OR DELETE ON shop_download_invoice_consents FOR EACH ROW EXECUTE FUNCTION shop_download_immutable()');
}
export async function migrateShopDownloadFulfilment(db){
 await migrateShopDownloadConsent(db);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_download_fulfilments(
  checkout_id uuid PRIMARY KEY REFERENCES shop_checkout_orders(id),company_id uuid NOT NULL REFERENCES companies(id),
  provider_payment_id text NOT NULL UNIQUE,billing_transaction_id uuid NOT NULL UNIQUE REFERENCES billing_transactions(id),
  entitlement_id uuid NOT NULL UNIQUE REFERENCES company_entitlements(id),invoice_number text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL,document_digest text NOT NULL CHECK(document_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 )`);
 await db.query('ALTER TABLE shop_download_fulfilments ADD COLUMN IF NOT EXISTS document_digest text');
 await db.query("CREATE OR REPLACE FUNCTION shop_download_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SHOP_DOWNLOAD_IMMUTABLE'; END; $$");
 for(const table of ['shop_download_invoice_consents','shop_download_fulfilments'])await db.query(`CREATE OR REPLACE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION shop_download_immutable()`);
}

// Disabled internal executor: provider GET only, atomic business writes on success. Not called by callbacks,
// startup or HTTP. TEST proof is categorically ineligible for business entitlements.
export async function fulfilShopLiveDownload(pool,{id,enabled=false,fetchPayment}){
 if(enabled!==true)throw shopError('FULFILMENT_DISABLED');if(!uuid(id)||typeof fetchPayment!=='function')throw shopError('INVALID_REQUEST');
 const reference=(await pool.query('SELECT provider_payment_id,provider_mode FROM shop_checkout_orders WHERE id=$1',[id])).rows[0];
 if(!reference||reference.provider_mode!=='live'||!reference.provider_payment_id)throw shopError('LIVE_PAYMENT_REQUIRED');
 let proof;try{proof=await fetchPayment(reference.provider_payment_id);}catch{throw shopError('PROVIDER_UNCERTAIN');}
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const order=await lockShopOrder(db,id);
  if(order.provider_mode!=='live'||!matchesShopLivePayment(order,proof)||proof.status!=='paid'||proof.customerId)throw shopError('PROVIDER_MISMATCH');
  if(order.status!=='paid'||order.provider_status!=='paid')throw shopError('CHECKOUT_PENDING');
  const snapshots=downloadSnapshot(order),job=(await db.query('SELECT * FROM shop_license_jobs WHERE checkout_id=$1 FOR UPDATE',[id])).rows[0];
  if(!job||job.company_id!==order.company_id||job.plan_code!=='download_license'||job.provider_payment_id!==order.provider_payment_id)throw shopError('FULFILMENT_MISMATCH');
  const consent=(await db.query('SELECT * FROM shop_download_invoice_consents WHERE checkout_id=$1 FOR UPDATE',[id])).rows[0];
  const seller=verifyDownloadConsent(consent,order),plan=(await db.query("SELECT id FROM billing_plans WHERE code='download_license'")).rows[0];if(!plan)throw shopError('FULFILMENT_MISMATCH');
  const paidAt=Date.parse(proof.paidAt),proofNow=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;if(!Number.isFinite(paidAt)||paidAt>new Date(proofNow).getTime()+300000||paidAt<new Date(order.created_at).getTime()-300000)throw shopError('PROVIDER_MISMATCH');
  const prior=(await db.query('SELECT * FROM shop_download_fulfilments WHERE checkout_id=$1 FOR UPDATE',[id])).rows[0];
  if(prior){
   const facts=await loadDownloadInvoiceRecords(db,order,prior);verifyDownloadInvoiceRecords(facts);
   if(facts.entitlement.status!=='active'||new Date(facts.invoice.paid_at).getTime()!==paidAt)throw shopError('FULFILMENT_MISMATCH');
   await db.query('COMMIT');return result(prior,true);
  }
  if(job.status!=='pending')throw shopError('FULFILMENT_MISMATCH');
  const guard=(await db.query('SELECT * FROM billing_checkout_guards WHERE company_id=$1 AND id=$2 FOR UPDATE',[order.company_id,order.guard_id])).rows[0];
  if(!guard||guard.status!=='open'||guard.slot!=='base'||guard.provider_payment_id!==order.provider_payment_id)throw shopError('CHECKOUT_PENDING');
  const draft=(await db.query('SELECT * FROM shop_order_drafts WHERE company_id=$1 AND id=$2 FOR UPDATE',[order.company_id,order.draft_id])).rows[0],line=draft?.snapshot?.lines?.[0];
  if(!draft||draft.status!=='draft'||draft.snapshot.lines.length!==1||line.quantity!==1||['productId','planCode','period','netCents','vatCents','grossCents'].some(k=>line[k]!==order.snapshot[k]))throw shopError('FULFILMENT_MISMATCH');
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now,date=berlinInvoiceDate(now);allowDownloadPdf({date,consent:true});
  await requireNoPendingBilling(db,order.company_id,{excludeGuardId:guard.id});
  const active=(await db.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code IN ('pos_base_monthly','download_license','restaurant_monthly') AND (ce.status='active' OR (ce.status='canceled' AND (ce.current_period_end IS NULL OR ce.current_period_end>clock_timestamp()))) LIMIT 1",[order.company_id])).rows.length;
  const feature=(await db.query("SELECT 1 FROM company_features WHERE company_id=$1 AND feature_code IN ('pos_base','download_license','restaurant') AND status='active' AND payment_status<>'trial' AND (ends_at IS NULL OR ends_at>clock_timestamp() OR grace_until>clock_timestamp()) LIMIT 1",[order.company_id])).rows.length;
  if(active||feature)throw shopError('ALREADY_ACTIVE');
  if((await db.query('SELECT 1 FROM billing_transactions WHERE provider_payment_id=$1',[order.provider_payment_id])).rows.length)throw shopError('PAYMENT_ALREADY_RECORDED');
  if(guard.plan_id!==plan.id)throw shopError('FULFILMENT_MISMATCH');
  const seq=(await db.query("SELECT nextval('invoice_number_seq') AS n")).rows[0].n,number='BN-'+date.slice(0,4)+'-'+String(seq).padStart(6,'0'),transactionId=crypto.randomUUID(),entitlementId=crypto.randomUUID();
  const snapshot={version:1,checkoutId:id,invoiceNumber:number,invoiceDate:date,serviceDate:date,description:downloadInvoiceDescription,quantity:1,vatRate:19,seller,...snapshots};
  await db.query("INSERT INTO billing_transactions(id,company_id,plan_id,provider,provider_payment_id,status,amount_cents,currency,invoice_number,invoice_date,paid_at,net_cents,vat_cents,vat_rate,billing_snapshot) VALUES($1,$2,$3,'mollie',$4,'paid',$5,'EUR',$6,$7,$8,$9,$10,19,$11)",[transactionId,order.company_id,plan.id,order.provider_payment_id,order.snapshot.grossCents,number,date,new Date(paidAt).toISOString(),order.snapshot.netCents,order.snapshot.vatCents,JSON.stringify(snapshots.buyer)]);
  await db.query("INSERT INTO company_entitlements(id,company_id,plan_id,status,provider,provider_reference,purchased_at,current_period_end) VALUES($1,$2,$3,'active','mollie',$4,$5,NULL)",[entitlementId,order.company_id,plan.id,order.provider_payment_id,now]);
  const fulfilment=(await db.query('INSERT INTO shop_download_fulfilments(checkout_id,company_id,provider_payment_id,billing_transaction_id,entitlement_id,invoice_number,snapshot,document_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,order.company_id,order.provider_payment_id,transactionId,entitlementId,number,JSON.stringify(snapshot),downloadInvoiceDigest(snapshot)])).rows[0];
  await db.query("UPDATE shop_license_jobs SET status='done' WHERE checkout_id=$1",[id]);await db.query("UPDATE billing_checkout_guards SET status='resolved' WHERE id=$1 AND company_id=$2",[guard.id,order.company_id]);
  verifyDownloadInvoiceRecords(await loadDownloadInvoiceRecords(db,order,fulfilment));
  await db.query('COMMIT');return result(fulfilment,false);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
function result(row,replay){return {id:row.checkout_id,invoiceNumber:row.invoice_number,entitlementId:row.entitlement_id,invoiceRecorded:true,invoiceDelivered:false,replay,checkoutConnected:false};}

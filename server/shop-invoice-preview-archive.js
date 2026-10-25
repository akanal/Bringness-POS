import crypto from 'node:crypto';
import {uuid} from './shop-drafts.js';
import {shopError,shopActor,sessionHash} from './shop-account.js';
import {downloadInvoiceDigest,loadDownloadInvoiceRecords,verifyDownloadInvoiceRecords} from './shop-download-invoice.js';
import {renderShopDownloadInvoicePreviewPdf,shopDownloadInvoicePdfResponse} from './shop-download-invoice-pdf.js';
const rendererVersion='shop-preview-pdf-v1',maxBytes=2097152;
export async function migrateShopInvoicePreviewArchive(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_invoice_preview_files(checkout_id uuid PRIMARY KEY REFERENCES shop_download_fulfilments(checkout_id),company_id uuid NOT NULL REFERENCES companies(id),billing_transaction_id uuid NOT NULL UNIQUE REFERENCES billing_transactions(id),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),pdf_sha256 text NOT NULL CHECK(pdf_sha256 ~ '^[a-f0-9]{64}$'),renderer_version text NOT NULL CHECK(renderer_version='shop-preview-pdf-v1'),pdf bytea NOT NULL CHECK(octet_length(pdf) BETWEEN 100 AND 2097152),created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 await db.query("CREATE OR REPLACE FUNCTION shop_invoice_preview_file_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SHOP_PREVIEW_FILE_IMMUTABLE'; END; $$");
 await db.query('CREATE OR REPLACE TRIGGER shop_invoice_preview_file_immutable BEFORE UPDATE OR DELETE ON shop_invoice_preview_files FOR EACH ROW EXECUTE FUNCTION shop_invoice_preview_file_immutable()');
}
async function facts(db,hash,id,lock=false){
 const first=await shopActor(db,hash);
 if(lock)await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[first.company_id]);
 const actor=lock?await shopActor(db,hash,true):first;if(actor.company_id!==first.company_id)throw shopError('ACCOUNT_CHANGED');
 const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE company_id=$1 AND id=$2',[actor.company_id,id])).rows[0];if(!order)throw shopError('CHECKOUT_NOT_FOUND');
 const record=(await db.query('SELECT * FROM shop_download_fulfilments WHERE company_id=$1 AND checkout_id=$2',[actor.company_id,id])).rows[0];if(!record)throw shopError('INVOICE_NOT_READY');
 const snapshot=verifyDownloadInvoiceRecords(await loadDownloadInvoiceRecords(db,order,record));
 return {actor,record,snapshot,digest:downloadInvoiceDigest(snapshot)};
}
function validateFile(row,source){
 const bytes=Buffer.isBuffer(row?.pdf)?row.pdf:row?.pdf instanceof Uint8Array?Buffer.from(row.pdf):null;
 if(!bytes||bytes.length<100||bytes.length>maxBytes||bytes.subarray(0,8).toString()!=='%PDF-1.7'||row.checkout_id!==source.record.checkout_id||row.company_id!==source.actor.company_id||row.billing_transaction_id!==source.record.billing_transaction_id||row.source_digest!==source.digest||row.renderer_version!==rendererVersion||crypto.createHash('sha256').update(bytes).digest('hex')!==row.pdf_sha256)throw shopError('PREVIEW_ARCHIVE_MISMATCH');
 return bytes;
}
function result(row,source,replay){return {kind:'invoice_preview',label:'Vorschau – keine ausgestellte Rechnung',id:row.checkout_id,digest:row.source_digest,pdfSha256:row.pdf_sha256,createdAt:new Date(row.created_at).toISOString(),replay,invoiceDelivered:false,canPay:false,canActivate:false,checkoutConnected:false,...shopDownloadInvoicePdfResponse(source.snapshot,validateFile(row,source))};}
export async function readShopInvoicePreviewFile(pool,{token,id}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const source=await facts(db,hash,id),row=(await db.query('SELECT * FROM shop_invoice_preview_files WHERE company_id=$1 AND checkout_id=$2',[source.actor.company_id,id])).rows[0];if(!row)throw shopError('PREVIEW_FILE_NOT_FOUND');const value=result(row,source,true);await db.query('COMMIT');return value;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
// Explicit internal candidate only. No startup import, HTTP mounting, mail, payment
// or invoice-number allocation. Every stored byte still says PREVIEW, not invoice.
export async function archiveShopInvoicePreviewFile(pool,{token,id,enabled=false,render=renderShopDownloadInvoicePreviewPdf,publicOrigin}){
 if(enabled!==true)throw shopError('PREVIEW_ARCHIVE_DISABLED');if(!uuid(id)||typeof render!=='function')throw shopError('INVALID_REQUEST');const hash=sessionHash(token);
 try{return await readShopInvoicePreviewFile(pool,{token,id});}catch(e){if(e.code!=='PREVIEW_FILE_NOT_FOUND')throw e;}
 const first=await pool.connect();let before;
 try{await first.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await first.query("SET LOCAL statement_timeout='5s'");before=await facts(first,hash,id);await first.query('COMMIT');}catch(e){await first.query('ROLLBACK');throw e;}finally{first.release();}
 const bytes=await render(before.snapshot,{publicOrigin});shopDownloadInvoicePdfResponse(before.snapshot,bytes);
 const sha=crypto.createHash('sha256').update(bytes).digest('hex'),db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const source=await facts(db,hash,id,true);if(source.digest!==before.digest||source.actor.company_id!==before.actor.company_id||source.record.billing_transaction_id!==before.record.billing_transaction_id)throw shopError('INVOICE_PREVIEW_CHANGED');
  const finalActor=await shopActor(db,hash,true);if(finalActor.company_id!==source.actor.company_id)throw shopError('ACCOUNT_CHANGED');
  const old=(await db.query('SELECT * FROM shop_invoice_preview_files WHERE company_id=$1 AND checkout_id=$2',[source.actor.company_id,id])).rows[0];
  if(old){const value=result(old,source,true);await db.query('COMMIT');return value;}
  const row=(await db.query('INSERT INTO shop_invoice_preview_files(checkout_id,company_id,billing_transaction_id,source_digest,pdf_sha256,renderer_version,pdf) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,source.actor.company_id,source.record.billing_transaction_id,source.digest,sha,rendererVersion,bytes])).rows[0];
  const value=result(row,source,false);await db.query('COMMIT');return value;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

import {shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {loadDownloadInvoiceRecords,verifyDownloadInvoiceRecords,downloadInvoiceDigest} from './shop-download-invoice.js';

// Explicit bounded operator inspection, disabled and unmounted. No customer
// profile, invoice number, provider reference or session is returned. This checks
// local consistency, never fresh provider status, delivery or fiscal readiness.
export async function auditShopDownloadFulfilments(pool,{enabled=false,limit=50,after=null}={}){
 if(enabled!==true)throw shopError('AUDIT_DISABLED');
 if(!Number.isInteger(limit)||limit<1||limit>100||(after!==null&&!uuid(after)))throw shopError('INVALID_REQUEST');
 const db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");
  const rows=(await db.query('SELECT * FROM shop_download_fulfilments WHERE ($1::uuid IS NULL OR checkout_id>$1::uuid) ORDER BY checkout_id LIMIT $2',[after,limit+1])).rows,items=[];
  for(const record of rows.slice(0,limit)){
   const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE id=$1 AND company_id=$2',[record.checkout_id,record.company_id])).rows[0];
   // Database errors abort the whole inspection, rather than implying success
   // or reporting an infrastructure failure as a damaged invoice.
   const facts=order?await loadDownloadInvoiceRecords(db,order,record):null;
   try{if(!facts)throw shopError('FULFILMENT_MISMATCH');const model=verifyDownloadInvoiceRecords(facts);items.push({id:record.checkout_id,consistent:true,digest:downloadInvoiceDigest(model)});}
   catch(e){if(!e.code)throw e;items.push({id:record.checkout_id,consistent:false,code:'FULFILMENT_MISMATCH'});}
  }
  await db.query('COMMIT');return {items,next:rows.length>limit?items.at(-1).id:null,providerVerified:false,invoiceDeliveryVerified:false,canRepair:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

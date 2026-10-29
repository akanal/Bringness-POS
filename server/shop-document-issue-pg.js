import {randomUUID} from 'node:crypto';
import {digestShopDocument} from './shop-document-archive-policy.js';
import {validateShopDocumentNumber} from './shop-document-number-policy.js';
// Isolated transaction primitive. Not mounted in production.
// Fiscal correctness and invoice content must be validated by the caller.
export async function issueShopDocumentRecord(pool,{companyId,kind,year,orderId,originalDocumentId=null,content,id=randomUUID(),archive=false,requirePaid=false}){
 if(typeof requirePaid!=='boolean')throw Error('SHOP_DOCUMENT_PAYMENT_OPTION_INVALID');
 if(typeof archive!=='boolean')throw Error('SHOP_DOCUMENT_ARCHIVE_OPTION_INVALID');
 if(requirePaid&&!archive)throw Error('SHOP_DOCUMENT_ARCHIVE_REQUIRED');
 if(!['invoice','credit_note'].includes(kind)||!Number.isSafeInteger(year)||year<2000||year>9999)throw Error('SHOP_DOCUMENT_ISSUE_INVALID');
 if(typeof companyId!=='string'||typeof orderId!=='string'||!companyId||!orderId||!content||typeof content!=='object'||Array.isArray(content))throw Error('SHOP_DOCUMENT_ISSUE_INVALID');
 if(kind==='credit_note'&&!originalDocumentId)throw Error('SHOP_DOCUMENT_ORIGINAL_REQUIRED');
 if(kind==='invoice'&&originalDocumentId!==null)throw Error('SHOP_DOCUMENT_ORIGINAL_UNEXPECTED');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  if(requirePaid){
   const payment=await db.query('SELECT amount_cents,currency,snapshot,provider_reference FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2 FOR UPDATE',[orderId,companyId]);
   const row=payment.rows[0];
   if(!row||!row.provider_reference||row.currency!=='EUR'||!row.snapshot||!(kind==='invoice'?row.snapshot.status==='paid':['partially_refunded','refunded'].includes(row.snapshot.status)))throw Error('SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED');
   const events=row.snapshot.events;
   if(!Array.isArray(events)||events.some(event=>!event||typeof event.id!=='string'||!event.id||event.id.length>160||!['paid','refund'].includes(event.kind)||!Number.isSafeInteger(event.amountCents)||event.amountCents<=0)||new Set(events.map(event=>event.id)).size!==events.length)throw Error('SHOP_DOCUMENT_PAYMENT_LEDGER_INVALID');
   const paidAmount=events.filter(event=>event.kind==='paid').reduce((sum,event)=>sum+event.amountCents,0);
   const refundedAmount=events.filter(event=>event.kind==='refund').reduce((sum,event)=>sum+event.amountCents,0);
   if(!Number.isSafeInteger(paidAmount)||paidAmount!==Number(row.amount_cents)||!Number.isSafeInteger(refundedAmount)||refundedAmount>paidAmount)throw Error('SHOP_DOCUMENT_PAYMENT_LEDGER_INVALID');
   if(events.filter(event=>event.kind==='paid').length!==1||row.snapshot.amountCents!==Number(row.amount_cents))throw Error('SHOP_DOCUMENT_PAYMENT_LEDGER_INVALID');
   if(events[0]?.kind!=='paid'||events[0].id!==row.provider_reference||events.slice(1).some(event=>event.kind!=='refund'))throw Error('SHOP_DOCUMENT_PAYMENT_LEDGER_INVALID');
   if(kind==='invoice'&&refundedAmount!==0)throw Error('SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED');
   if(kind==='credit_note'&&(refundedAmount===0||row.snapshot.status==='refunded'&&refundedAmount!==paidAmount||row.snapshot.status==='partially_refunded'&&refundedAmount>=paidAmount))throw Error('SHOP_DOCUMENT_PAYMENT_LEDGER_INVALID');
   if(kind==='invoice'){
    if(!Number.isSafeInteger(content.totalCents)||content.totalCents!==Number(row.amount_cents)||row.snapshot.amountCents!==Number(row.amount_cents))throw Error('SHOP_DOCUMENT_PAYMENT_AMOUNT_MISMATCH');
    const existing=await db.query("SELECT id FROM shop_document_records WHERE order_id=$1 AND company_id=$2 AND kind='invoice'",[orderId,companyId]);
    if(existing.rows.length)throw Error('SHOP_DOCUMENT_INVOICE_ALREADY_EXISTS');
   }else{
    const refundId=content.refundId;
    if(typeof refundId!=='string'||!/^re_[A-Za-z0-9]+$/.test(refundId)||!Number.isSafeInteger(content.amountCents)||content.amountCents<=0||content.currency!=='EUR'||content.originalInvoiceId!==originalDocumentId)throw Error('SHOP_DOCUMENT_REFUND_INVALID');
    const refunds=row.snapshot.events.filter(event=>event.kind==='refund'&&event.id===refundId);
    if(refunds.length!==1||refunds[0].amountCents!==content.amountCents)throw Error('SHOP_DOCUMENT_REFUND_NOT_CONFIRMED');
    const existing=await db.query("SELECT id FROM shop_document_records WHERE company_id=$1 AND order_id=$2 AND kind='credit_note' AND content->>'refundId'=$3",[companyId,orderId,refundId]);
    if(existing.rows.length)throw Error('SHOP_DOCUMENT_REFUND_ALREADY_CREDITED');
   }
  }
  if(kind==='credit_note'){
   const original=await db.query("SELECT id FROM shop_document_records WHERE id=$1 AND company_id=$2 AND order_id=$3 AND kind='invoice'",[originalDocumentId,companyId,orderId]);
   if(original.rows.length!==1)throw Error('SHOP_DOCUMENT_ORIGINAL_NOT_FOUND');
  }
  const sequenceResult=await db.query(`INSERT INTO shop_document_counters(company_id,kind,year,last_sequence)
 VALUES($1,$2,$3,1) ON CONFLICT(company_id,kind,year)
 DO UPDATE SET last_sequence=shop_document_counters.last_sequence+1
 WHERE shop_document_counters.last_sequence<999999999 RETURNING last_sequence`,[companyId,kind,year]);
  if(sequenceResult.rows.length!==1)throw Error('SHOP_DOCUMENT_SEQUENCE_EXHAUSTED');
  const sequence=Number(sequenceResult.rows[0].last_sequence);
  const documentNumber=`${kind==='invoice'?'INV':'CRN'}-${year}-${String(sequence).padStart(9,'0')}`;
  validateShopDocumentNumber({companyId,kind,year,sequence,documentNumber});
  await db.query(`INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,original_document_id,content)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,companyId,kind,year,sequence,documentNumber,orderId,originalDocumentId,content]);
  if(archive){
   const payload={documentNumber,kind,orderId,content};
   const {digest}=digestShopDocument(payload);
   await db.query('INSERT INTO shop_document_archive(document_id,payload,digest_sha256) VALUES($1,$2,$3)',[id,payload,digest]);
  }
  await db.query('COMMIT');
  return Object.freeze({id,companyId,kind,year,sequence,documentNumber,orderId});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

import {randomUUID} from 'node:crypto';
import {digestShopDocument} from './shop-document-archive-policy.js';
import {validateShopDocumentNumber} from './shop-document-number-policy.js';
// Isolated transaction primitive. Not mounted in production.
// Fiscal correctness and invoice content must be validated by the caller.
export async function issueShopDocumentRecord(pool,{companyId,kind,year,orderId,originalDocumentId=null,content,id=randomUUID(),archive=false}){
 if(!['invoice','credit_note'].includes(kind)||!Number.isSafeInteger(year)||year<2000||year>9999)throw Error('SHOP_DOCUMENT_ISSUE_INVALID');
 if(typeof companyId!=='string'||typeof orderId!=='string'||!companyId||!orderId||!content||typeof content!=='object'||Array.isArray(content))throw Error('SHOP_DOCUMENT_ISSUE_INVALID');
 if(kind==='credit_note'&&!originalDocumentId)throw Error('SHOP_DOCUMENT_ORIGINAL_REQUIRED');
 if(kind==='invoice'&&originalDocumentId!==null)throw Error('SHOP_DOCUMENT_ORIGINAL_UNEXPECTED');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
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

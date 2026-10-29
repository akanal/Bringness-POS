import {validateShopDocumentNumber} from './shop-document-number-policy.js';
// Isolated storage primitive, not an invoice issuance endpoint.
// A caller must validate tax/legal content before storing a final document.
export async function migrateShopDocumentRecords(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_document_records(
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('invoice','credit_note')),
 year integer NOT NULL,
 sequence bigint NOT NULL,
 document_number text NOT NULL,
 order_id uuid NOT NULL,
 original_document_id uuid,
 content jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,kind,year,sequence),
 UNIQUE(company_id,document_number),
 CHECK ((kind='invoice' AND original_document_id IS NULL) OR (kind='credit_note' AND original_document_id IS NOT NULL))
 )`);
}
export async function storeShopDocumentRecord(pool,{id,companyId,kind,year,sequence,documentNumber,orderId,originalDocumentId=null,content}){
 validateShopDocumentNumber({companyId,kind,year,sequence,documentNumber});
 if(typeof id!=='string'||typeof orderId!=='string'||!id||!orderId)throw Error('SHOP_DOCUMENT_ID_INVALID');
 if(kind==='credit_note'&&(!originalDocumentId||originalDocumentId===id))throw Error('SHOP_DOCUMENT_ORIGINAL_REQUIRED');
 if(kind==='invoice'&&originalDocumentId!==null)throw Error('SHOP_DOCUMENT_ORIGINAL_UNEXPECTED');
 if(!content||typeof content!=='object'||Array.isArray(content))throw Error('SHOP_DOCUMENT_CONTENT_INVALID');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  if(kind==='credit_note'){
   const original=await db.query("SELECT id FROM shop_document_records WHERE id=$1 AND company_id=$2 AND order_id=$3 AND kind='invoice'",[originalDocumentId,companyId,orderId]);
   if(original.rows.length!==1)throw Error('SHOP_DOCUMENT_ORIGINAL_NOT_FOUND');
  }
  await db.query(`INSERT INTO shop_document_records(id,company_id,kind,year,sequence,document_number,order_id,original_document_id,content)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,companyId,kind,year,sequence,documentNumber,orderId,originalDocumentId,content]);
  await db.query('COMMIT');
  return Object.freeze({id,companyId,kind,documentNumber,orderId});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

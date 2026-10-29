import {validateShopDocumentNumber} from './shop-document-number-policy.js';
// Isolated persistence primitive. Not mounted in production routes.
export async function migrateShopDocumentNumbers(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_document_counters(
 company_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('invoice','credit_note')),
 year integer NOT NULL CHECK(year BETWEEN 2000 AND 9999),
 last_sequence bigint NOT NULL CHECK(last_sequence BETWEEN 1 AND 999999999),
 PRIMARY KEY(company_id,kind,year)
 )`);
}
export async function allocateShopDocumentNumber(pool,{companyId,kind,year}){
 if(typeof companyId!=='string'||!companyId.trim())throw Error('SHOP_DOCUMENT_COMPANY_INVALID');
 if(!['invoice','credit_note'].includes(kind))throw Error('SHOP_DOCUMENT_KIND_INVALID');
 if(!Number.isSafeInteger(year)||year<2000||year>9999)throw Error('SHOP_DOCUMENT_YEAR_INVALID');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const result=await db.query(`INSERT INTO shop_document_counters(company_id,kind,year,last_sequence)
 VALUES($1,$2,$3,1)
 ON CONFLICT(company_id,kind,year)
 DO UPDATE SET last_sequence=shop_document_counters.last_sequence+1
 WHERE shop_document_counters.last_sequence<999999999
 RETURNING last_sequence`,[companyId,kind,year]);
  if(result.rows.length!==1)throw Error('SHOP_DOCUMENT_SEQUENCE_EXHAUSTED');
  const sequence=Number(result.rows[0].last_sequence);
  const documentNumber=`${kind==='invoice'?'INV':'CRN'}-${year}-${String(sequence).padStart(9,'0')}`;
  const allocated=validateShopDocumentNumber({companyId,kind,year,sequence,documentNumber});
  await db.query('COMMIT');
  return allocated;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

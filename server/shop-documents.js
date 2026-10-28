import crypto from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {documentObjectKey,documentMaxBytes} from './idrive-document-store.js';
export const documentLimits={maxBytes:documentMaxBytes,maxFiles:100,maxAccountBytes:100*1024*1024,maxNewUploadsPer24Hours:20};
export function documentInput({id,filename,mime,bytes}){
 if(!uuid(id)||id!==id.toLowerCase()||typeof filename!=='string'||filename.length<1||filename.length>160||filename!==filename.normalize('NFC')||/[\p{Cc}\p{Cf}\p{Cs}\\/]/u.test(filename)||filename.trim()!==filename||!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>documentMaxBytes)throw shopError('INVALID_DOCUMENT');
 const signatures={'application/pdf':bytes.subarray(0,5).toString()==='%PDF-'&&/\.pdf$/i.test(filename),'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&/\.png$/i.test(filename),'image/jpeg':bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&/\.jpe?g$/i.test(filename)};
 if(!Object.hasOwn(signatures,mime)||!signatures[mime])throw shopError('INVALID_DOCUMENT');
 const sha=crypto.createHash('sha256').update(bytes).digest('hex'),requestDigest=crypto.createHash('sha256').update(JSON.stringify([filename,mime,bytes.length,sha])).digest('hex');
 return {id,filename,mime,bytes,sha,requestDigest,size:bytes.length};
}
export async function migrateShopDocuments(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_account_documents(company_id uuid NOT NULL REFERENCES companies(id),id uuid NOT NULL,filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 160),mime text NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),byte_length integer NOT NULL CHECK(byte_length BETWEEN 8 AND 5242880),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),object_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_document_upload_attempts(company_id uuid NOT NULL REFERENCES companies(id),id uuid NOT NULL,request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,id))`);
 await db.query("CREATE OR REPLACE FUNCTION shop_account_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'DOCUMENT_IMMUTABLE'; END; $$");
 await db.query('CREATE OR REPLACE TRIGGER shop_account_document_immutable BEFORE UPDATE OR DELETE ON shop_account_documents FOR EACH ROW EXECUTE FUNCTION shop_account_document_immutable()');
}
const view=row=>({id:row.id,filename:row.filename,mime:row.mime,bytes:row.byte_length,sha256:row.sha256,createdAt:new Date(row.created_at).toISOString(),storage:'idrive'});
export async function authorizeDocuments(pool,token){return shopActor(pool,sessionHash(token));}
export async function listShopDocuments(pool,{token}){
 const hash=sessionHash(token),actor=await shopActor(pool,hash),rows=(await pool.query('SELECT * FROM shop_account_documents WHERE company_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[actor.company_id])).rows;
 const final=await shopActor(pool,hash);if(final.company_id!==actor.company_id)throw shopError('UNAUTHORIZED');return {documents:rows.map(view),limits:documentLimits};
}
function storageRecord(row){
 const record={company:row.company_id,id:row.id,sha:row.sha256,requestDigest:row.request_digest,size:row.byte_length,mime:row.mime};
 if(row.object_key!==documentObjectKey(record.company,record.id,record.sha))throw shopError('DOCUMENT_STORAGE_UNAVAILABLE');return record;
}
async function usageCheck(db,company,size){
 const usage=(await db.query('SELECT count(*)::integer AS files,coalesce(sum(byte_length),0)::bigint AS bytes FROM shop_account_documents WHERE company_id=$1',[company])).rows[0];
 const total=(await db.query('SELECT count(*)::integer AS files FROM shop_account_documents')).rows[0];
 if(usage.files>=documentLimits.maxFiles||Number(usage.bytes)+size>documentLimits.maxAccountBytes||total.files>=5000)throw shopError('DOCUMENT_QUOTA');
}
export async function uploadShopDocument(pool,store,{token,...input}){
 const doc=documentInput(input),hash=sessionHash(token);let company;
 // Commit a durable bounded upload intent before provider I/O: even failures or
 // logout during upload consume the same daily allowance and never create unlimited orphans.
 const reserve=await pool.connect();try{
  await reserve.query('BEGIN');await reserve.query("SET LOCAL statement_timeout='5s'");company=(await shopActor(reserve,hash)).company_id;
  await reserve.query('SELECT pg_advisory_xact_lock(741920681)');
  const old=(await reserve.query('SELECT * FROM shop_account_documents WHERE company_id=$1 AND id=$2',[company,doc.id])).rows[0];
  if(old){if(old.request_digest!==doc.requestDigest)throw shopError('DOCUMENT_CONFLICT');await shopActor(reserve,hash,true);await reserve.query('COMMIT');return {...view(old),replay:true};}
  await usageCheck(reserve,company,doc.size);
  const attempt=(await reserve.query('SELECT request_digest FROM shop_document_upload_attempts WHERE company_id=$1 AND id=$2',[company,doc.id])).rows[0];
  if(attempt){if(attempt.request_digest!==doc.requestDigest)throw shopError('DOCUMENT_CONFLICT');}
  else{
   const counts=(await reserve.query("SELECT count(*) FILTER(WHERE company_id=$1)::integer AS account,count(*)::integer AS total FROM shop_document_upload_attempts WHERE created_at>clock_timestamp()-interval '24 hours'",[company])).rows[0];
   if(counts.account>=20||counts.total>=200)throw shopError('DOCUMENT_QUOTA');
   await reserve.query('INSERT INTO shop_document_upload_attempts(company_id,id,request_digest) VALUES($1,$2,$3)',[company,doc.id,doc.requestDigest]);
  }
  if((await shopActor(reserve,hash,true)).company_id!==company)throw shopError('UNAUTHORIZED');await reserve.query('COMMIT');
 }catch(error){await reserve.query('ROLLBACK');throw error;}finally{reserve.release();}
 await store.putExact({company,...doc},doc.bytes);
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash,true);if(actor.company_id!==company)throw shopError('UNAUTHORIZED');
  await db.query('SELECT pg_advisory_xact_lock(741920681)');
  const old=(await db.query('SELECT * FROM shop_account_documents WHERE company_id=$1 AND id=$2',[company,doc.id])).rows[0];
  if(old){if(old.request_digest!==doc.requestDigest)throw shopError('DOCUMENT_CONFLICT');await db.query('COMMIT');return {...view(old),replay:true};}
  await usageCheck(db,company,doc.size);
  const object_key=documentObjectKey(company,doc.id,doc.sha);
  const row=(await db.query('INSERT INTO shop_account_documents(company_id,id,filename,mime,byte_length,sha256,request_digest,object_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[company,doc.id,doc.filename,doc.mime,doc.size,doc.sha,doc.requestDigest,object_key])).rows[0];
  await db.query('COMMIT');return {...view(row),replay:false};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function downloadShopDocument(pool,store,{token,id}){
 if(!uuid(id))throw shopError('INVALID_DOCUMENT');const hash=sessionHash(token),actor=await shopActor(pool,hash);
 const row=(await pool.query('SELECT * FROM shop_account_documents WHERE company_id=$1 AND id=$2',[actor.company_id,id])).rows[0];if(!row)throw shopError('DOCUMENT_NOT_FOUND');
 const body=await store.getExact(storageRecord(row));const final=await shopActor(pool,hash);if(final.company_id!==actor.company_id)throw shopError('UNAUTHORIZED');
 return {body,document:view(row)};
}

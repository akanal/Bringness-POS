import {authorizeShopDocumentAccess} from './shop-document-access-policy.js';
import {verifyShopDocumentDigest} from './shop-document-archive-policy.js';
// Isolated read primitive. Caller must authenticate and authorize the actor.
// Read and audit entry use the same transaction so an audit failure prevents data release.
export async function readShopArchivedDocument(pool,{documentId,actorId,action='read'}){
 if(typeof documentId!=='string'||!documentId)throw Error('SHOP_ARCHIVE_ACCESS_INVALID');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const result=await db.query('SELECT a.payload,a.digest_sha256,r.company_id FROM shop_document_archive a JOIN shop_document_records r ON r.id=a.document_id WHERE a.document_id=$1',[documentId]);
  if(result.rows.length!==1)throw Error('SHOP_ARCHIVE_NOT_FOUND');
  const {payload,digest_sha256:digest,company_id:companyId}=result.rows[0];
  const {actorId}=authorizeShopDocumentAccess({actor,companyId,action});
  if(!verifyShopDocumentDigest(payload,{algorithm:'sha256',digest}))throw Error('SHOP_ARCHIVE_INTEGRITY_FAILED');
  await db.query('INSERT INTO shop_document_archive_audit(document_id,actor_id,action) VALUES($1,$2,$3)',[documentId,actorId,action]);
  await db.query('COMMIT');
  return Object.freeze({documentId,payload,digest});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

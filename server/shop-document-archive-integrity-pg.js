import {verifyShopDocumentDigest} from './shop-document-archive-policy.js';
// Isolated cross-check: archive must match the original issued document content.
// Does not authorize access or replace a full archival retention system.
export async function verifyShopDocumentArchiveConsistency(pool,documentId){
 if(typeof documentId!=='string'||!documentId)throw Error('SHOP_ARCHIVE_DOCUMENT_ID_INVALID');
 const result=await pool.query(`SELECT r.content,r.document_number,r.kind,r.order_id,a.payload,a.digest_sha256
 FROM shop_document_records r JOIN shop_document_archive a ON a.document_id=r.id
 WHERE r.id=$1`,[documentId]);
 if(result.rows.length!==1)throw Error('SHOP_ARCHIVE_DOCUMENT_NOT_FOUND');
 const row=result.rows[0];
 if(!verifyShopDocumentDigest(row.payload,{algorithm:'sha256',digest:row.digest_sha256}))throw Error('SHOP_ARCHIVE_DIGEST_MISMATCH');
 const expected={documentNumber:row.document_number,kind:row.kind,orderId:row.order_id,content:row.content};
 if(JSON.stringify(row.payload)!==JSON.stringify(expected)){
  // Compare canonical digests to avoid object key-order dependence.
  const {digestShopDocument}=await import('./shop-document-archive-policy.js');
  if(digestShopDocument(row.payload).digest!==digestShopDocument(expected).digest)throw Error('SHOP_ARCHIVE_RECORD_MISMATCH');
 }
 return true;
}

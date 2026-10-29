import {digestShopDocument} from './shop-document-archive-policy.js';
// Isolated operation; archive content is derived from the issued record, never caller supplied.
export async function archiveIssuedShopDocument(pool,documentId){
 if(typeof documentId!=='string'||!documentId)throw Error('SHOP_ARCHIVE_DOCUMENT_ID_INVALID');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const result=await db.query('SELECT id,document_number,kind,order_id,content FROM shop_document_records WHERE id=$1 FOR SHARE',[documentId]);
  if(result.rows.length!==1)throw Error('SHOP_ARCHIVE_DOCUMENT_NOT_FOUND');
  const row=result.rows[0];
  const payload={documentNumber:row.document_number,kind:row.kind,orderId:row.order_id,content:row.content};
  const {digest}=digestShopDocument(payload);
  const inserted=await db.query('INSERT INTO shop_document_archive(document_id,payload,digest_sha256) VALUES($1,$2,$3) ON CONFLICT(document_id) DO NOTHING RETURNING document_id',[documentId,payload,digest]);
  if(inserted.rows.length!==1)throw Error('SHOP_ARCHIVE_ALREADY_EXISTS');
  await db.query('COMMIT');
  return Object.freeze({documentId,digest});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

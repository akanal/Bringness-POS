import {digestShopDocument,verifyShopDocumentDigest} from './shop-document-archive-policy.js';
// Isolated integrity storage; no production route, retention policy or WORM guarantee.
export async function migrateShopDocumentArchive(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_document_archive(
 document_id uuid PRIMARY KEY REFERENCES shop_document_records(id),
 payload jsonb NOT NULL,
 digest_sha256 text NOT NULL CHECK(digest_sha256 ~ '^[a-f0-9]{64}$'),
 archived_at timestamptz NOT NULL DEFAULT now()
 )`);
 await pool.query(`CREATE OR REPLACE FUNCTION shop_document_archive_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $
 BEGIN RAISE EXCEPTION 'SHOP_ARCHIVE_IMMUTABLE'; END; $`);
 await pool.query(`DROP TRIGGER IF EXISTS shop_document_archive_immutable ON shop_document_archive`);
 await pool.query(`CREATE TRIGGER shop_document_archive_immutable BEFORE UPDATE OR DELETE ON shop_document_archive
 FOR EACH ROW EXECUTE FUNCTION shop_document_archive_reject_mutation()`);
}
export async function archiveShopDocument(pool,{documentId,payload}){
 if(typeof documentId!=='string'||!documentId||!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('SHOP_ARCHIVE_INPUT_INVALID');
 const {digest}=digestShopDocument(payload);
 const result=await pool.query(`INSERT INTO shop_document_archive(document_id,payload,digest_sha256)
 VALUES($1,$2,$3) ON CONFLICT(document_id) DO NOTHING RETURNING document_id`,[documentId,payload,digest]);
 if(result.rows.length!==1)throw Error('SHOP_ARCHIVE_ALREADY_EXISTS');
 return Object.freeze({documentId,digest});
}
export async function verifyArchivedShopDocument(pool,documentId){
 const result=await pool.query('SELECT payload,digest_sha256 FROM shop_document_archive WHERE document_id=$1',[documentId]);
 if(result.rows.length!==1)throw Error('SHOP_ARCHIVE_NOT_FOUND');
 return verifyShopDocumentDigest(result.rows[0].payload,{algorithm:'sha256',digest:result.rows[0].digest_sha256});
}

// Isolated audit primitive. Application authorization and retention remain separate.
export async function migrateShopDocumentArchiveAudit(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_document_archive_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 document_id uuid NOT NULL REFERENCES shop_document_records(id),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 160),
 action text NOT NULL CHECK(action IN ('read','verify','export')),
 occurred_at timestamptz NOT NULL DEFAULT now()
 )`);
 await pool.query(`CREATE OR REPLACE FUNCTION shop_document_archive_audit_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$$
 BEGIN RAISE EXCEPTION 'SHOP_ARCHIVE_AUDIT_IMMUTABLE'; END; $$`);
 await pool.query('DROP TRIGGER IF EXISTS shop_document_archive_audit_immutable ON shop_document_archive_audit');
 await pool.query(`CREATE TRIGGER shop_document_archive_audit_immutable BEFORE UPDATE OR DELETE ON shop_document_archive_audit
 FOR EACH ROW EXECUTE FUNCTION shop_document_archive_audit_reject_mutation()`);
}
export async function recordShopDocumentArchiveAccess(pool,{documentId,actorId,action}){
 if(typeof documentId!=='string'||!documentId||typeof actorId!=='string'||!actorId.trim()||actorId.length>160||!['read','verify','export'].includes(action))throw Error('SHOP_ARCHIVE_AUDIT_INVALID');
 const result=await pool.query(`INSERT INTO shop_document_archive_audit(document_id,actor_id,action)
 SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM shop_document_archive WHERE document_id=$1)
 RETURNING id,occurred_at`,[documentId,actorId,action]);
 if(result.rows.length!==1)throw Error('SHOP_ARCHIVE_AUDIT_DOCUMENT_NOT_FOUND');
 return Object.freeze({documentId,actorId,action,id:result.rows[0].id,occurredAt:result.rows[0].occurred_at});
}

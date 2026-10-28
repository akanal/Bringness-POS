import crypto from 'node:crypto';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unavailable = () => Object.assign(Error('RECEIPT_STORAGE_UNAVAILABLE'), {code:'RECEIPT_STORAGE_UNAVAILABLE'});
let configuration = {required:false, store:null};
export function configureReceiptStorage(options) { configuration = options; }
export async function migrateReceiptFiles(pool) {
 await pool.query(`CREATE TABLE IF NOT EXISTS pos_receipt_files (
 receipt_id uuid NOT NULL REFERENCES receipts(id), format text NOT NULL CHECK(format IN ('receipt','invoice')),
 company_id uuid NOT NULL REFERENCES companies(id), fiscal_status text NOT NULL, storage jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(receipt_id,format,fiscal_status))`);
 await pool.query("CREATE OR REPLACE FUNCTION pos_receipt_file_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'RECEIPT_FILE_IMMUTABLE'; END; $$");
 await pool.query('CREATE OR REPLACE TRIGGER pos_receipt_file_immutable BEFORE UPDATE OR DELETE ON pos_receipt_files FOR EACH ROW EXECUTE FUNCTION pos_receipt_file_immutable()');
}
// Called only after the route has authorized a receipt or its exact capability.
// An archived artifact never allocates a receipt number or changes payment/fiscal state.
export async function storedReceiptFile(pool, receipt, render, options=configuration) {
 if (!options.required) return render();
 if (!options.store || !receipt.receipt_id || !receipt.company_id) throw unavailable();
 const format=receipt.formatA4?'invoice':'receipt', fiscalStatus=receipt.fiscal_status, db=await pool.connect();
 try {
  await db.query('BEGIN');
  await db.query("SET LOCAL statement_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['receipt-file:'+receipt.receipt_id+':'+format]);
  const owner=(await db.query('SELECT r.company_id,rc.fiscal_status FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id WHERE rc.id=$1 FOR SHARE OF rc',[receipt.receipt_id])).rows[0];
  if (!owner || owner.company_id!==receipt.company_id || owner.fiscal_status!==fiscalStatus) throw unavailable();
  const old=(await db.query('SELECT company_id,storage FROM pos_receipt_files WHERE receipt_id=$1 AND format=$2 AND fiscal_status=$3',[receipt.receipt_id,format,fiscalStatus])).rows[0];
  let bytes;
  if (old) {
   const record=old.storage;
   if(old.company_id!==receipt.company_id || record.company!==receipt.company_id || record.mime!=='application/pdf') throw unavailable();
   bytes=await options.store.getExact(record);
   if(!Buffer.isBuffer(bytes) || bytes.length!==record.size || sha(bytes)!==record.sha) throw unavailable();
  } else {
   bytes=await render();
   if(!Buffer.isBuffer(bytes) || bytes.length<8 || bytes.length>5242880 || bytes.subarray(0,5).toString()!=='%PDF-') throw unavailable();
   const record={company:receipt.company_id,id:crypto.randomUUID(),sha:sha(bytes),size:bytes.length,mime:'application/pdf',requestDigest:sha(JSON.stringify([receipt.company_id,receipt.receipt_id,format,fiscalStatus]))};
   await options.store.putExact(record,bytes);
   await db.query('INSERT INTO pos_receipt_files(receipt_id,format,company_id,fiscal_status,storage) VALUES($1,$2,$3,$4,$5)',[receipt.receipt_id,format,receipt.company_id,fiscalStatus,record]);
  }
  await db.query('COMMIT');return bytes;
 } catch(error) { await db.query('ROLLBACK');throw error; } finally { db.release(); }
}

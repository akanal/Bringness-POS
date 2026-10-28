import crypto from 'node:crypto';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const unavailable=()=>Object.assign(Error('INVOICE_STORAGE_UNAVAILABLE'),{code:'INVOICE_STORAGE_UNAVAILABLE'});
export async function migrateBillingInvoiceStorage(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS billing_invoice_files(transaction_id uuid PRIMARY KEY REFERENCES billing_transactions(id),company_id uuid NOT NULL,source_digest text NOT NULL CHECK(source_digest~'^[a-f0-9]{64}$'),pdf_sha256 text NOT NULL CHECK(pdf_sha256~'^[a-f0-9]{64}$'),byte_length integer NOT NULL CHECK(byte_length BETWEEN 8 AND 5242880),created_at timestamptz NOT NULL DEFAULT now())`);
 await pool.query("CREATE OR REPLACE FUNCTION billing_invoice_file_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INVOICE_FILE_IMMUTABLE'; END; $$");
 await pool.query('CREATE OR REPLACE TRIGGER billing_invoice_file_immutable BEFORE UPDATE OR DELETE ON billing_invoice_files FOR EACH ROW EXECUTE FUNCTION billing_invoice_file_immutable()');
}
// Only existing, paid platform invoices. No number allocation or payment writes.
export async function storedBillingInvoice(pool,store,z,env,render){
 if(!store||z.status!=='paid'||!z.paid_at||!z.invoice_number)throw unavailable();
 const source=sha(JSON.stringify([z.company_id,z.id,z.invoice_number,z.invoice_date,z.net_cents,z.vat_cents,z.vat_rate,z.amount_cents,z.currency,z.billing_snapshot,z.name,env.INVOICE_SELLER_NAME||'Bringness',env.INVOICE_SELLER_ADDRESS||'',env.INVOICE_TAX_ID||'']));
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['billing-invoice:'+z.id]);
  const current=(await db.query('SELECT company_id,status,invoice_number FROM billing_transactions WHERE id=$1 FOR SHARE',[z.id])).rows[0];
  if(!current||current.company_id!==z.company_id||current.status!=='paid'||current.invoice_number!==z.invoice_number)throw unavailable();
  const old=(await db.query('SELECT * FROM billing_invoice_files WHERE transaction_id=$1',[z.id])).rows[0];
  if(old){
   if(old.company_id!==z.company_id||old.source_digest!==source)throw unavailable();
   const bytes=await store.getExact({company:old.company_id,id:z.id,sha:old.pdf_sha256,requestDigest:source,size:old.byte_length,mime:'application/pdf'});
   if(bytes.length!==old.byte_length||sha(bytes)!==old.pdf_sha256)throw unavailable();
   await db.query('COMMIT');return bytes;
  }
  const bytes=await render(z,env);
  if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>5242880||bytes.subarray(0,5).toString()!=='%PDF-')throw unavailable();
  const digest=sha(bytes);
  await store.putExact({company:z.company_id,id:z.id,sha:digest,requestDigest:source,size:bytes.length,mime:'application/pdf'},bytes);
  await db.query('INSERT INTO billing_invoice_files(transaction_id,company_id,source_digest,pdf_sha256,byte_length) VALUES($1,$2,$3,$4,$5)',[z.id,z.company_id,source,digest,bytes.length]);
  await db.query('COMMIT');return bytes;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

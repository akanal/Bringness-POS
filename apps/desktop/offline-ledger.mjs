// PGlite is PostgreSQL compiled to WASM. With a file dataDir and default
// durability, the transaction completes only after persistent storage flushes.
export async function createOfflineLedger(db,quote) {
 await db.exec(`CREATE TABLE IF NOT EXISTS offline_catalog(id uuid PRIMARY KEY,payload jsonb NOT NULL,current boolean NOT NULL DEFAULT false);
 CREATE TABLE IF NOT EXISTS offline_sales(id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES offline_catalog(id),request jsonb NOT NULL,receipt jsonb NOT NULL,synced_at timestamptz,cloud_receipt jsonb,error text,created_at timestamptz NOT NULL DEFAULT now());`);
 return {
  async catalog(snapshot){
   return db.transaction(async tx=>{
    if(!snapshot||typeof snapshot!=='object'||typeof snapshot.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.id)||typeof snapshot.companyId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.companyId)||!Array.isArray(snapshot.restaurants)||!Array.isArray(snapshot.products)||typeof snapshot.deviceKey!=='string'||snapshot.deviceKey.length!==64||!Number.isFinite(Date.parse(snapshot.createdAt))||!Number.isFinite(Date.parse(snapshot.validUntil))||Date.parse(snapshot.validUntil)<=Date.now()||Date.parse(snapshot.validUntil)<=Date.parse(snapshot.createdAt))throw Error('Offline-Katalog ist ungültig oder abgelaufen.');
    const previous=(await tx.query('SELECT payload FROM offline_catalog WHERE current')).rows[0]?.payload;
    if(previous&&previous.companyId!==snapshot.companyId&&(await tx.query('SELECT 1 FROM offline_sales WHERE synced_at IS NULL LIMIT 1')).rows.length)throw Error('Offene Verkäufe zuerst mit dem ursprünglichen Betrieb synchronisieren.');
    const existing=(await tx.query('SELECT payload, payload=$2::jsonb AS matches FROM offline_catalog WHERE id=$1',[snapshot.id,JSON.stringify(snapshot)])).rows[0];
    if(existing&&!existing.matches)throw Error('Offline-Katalogkennung wurde bereits mit anderen Daten verwendet.');
    await tx.query('UPDATE offline_catalog SET current=false WHERE id<>$1',[snapshot.id]);
    await tx.query('INSERT INTO offline_catalog VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET current=true',[snapshot.id,JSON.stringify(snapshot)]);
   });
  },
  async view(){
   const snapshot=(await db.query('SELECT payload FROM offline_catalog WHERE current')).rows[0]?.payload;
   // Always show every unresolved sale before historical synced receipts.
   const sales=(await db.query('SELECT receipt,synced_at,cloud_receipt,error FROM offline_sales ORDER BY (synced_at IS NULL) DESC,created_at DESC,id DESC LIMIT 100')).rows;
   const counts=(await db.query('SELECT count(*) FILTER (WHERE synced_at IS NULL)::bigint AS pending,count(*) FILTER (WHERE synced_at IS NULL AND error IS NOT NULL)::bigint AS errors,count(*) FILTER (WHERE synced_at IS NOT NULL)::bigint AS synced FROM offline_sales')).rows[0];
   return {snapshot,sales,counts:{pending:Number(counts.pending),errors:Number(counts.errors),synced:Number(counts.synced)}};
  },
  async sale(request){return db.transaction(async tx=>{
   if(!request||typeof request.id!=='string'||typeof request.snapshotId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.snapshotId))throw Error('Ungültige Offline-Verkaufskennung.');
   const old=(await tx.query('SELECT receipt,request=$2::jsonb AS matches FROM offline_sales WHERE id=$1',[request.id,JSON.stringify(request)])).rows[0];
   if(old){if(!old.matches)throw Error('Verkaufskennung bereits verwendet');return old.receipt;}
   const snapshot=(await tx.query("SELECT c.payload FROM offline_catalog c WHERE c.id=$1 AND c.payload->>'companyId'=(SELECT payload->>'companyId' FROM offline_catalog WHERE current)",[request.snapshotId])).rows[0]?.payload;
   if(!snapshot||!Number.isFinite(Date.parse(snapshot.validUntil))||Date.now()>Date.parse(snapshot.validUntil))throw Error('Offline-Freigabe abgelaufen. Bitte online anmelden.');
   const receipt=quote(snapshot,request);
   await tx.query('INSERT INTO offline_sales(id,snapshot_id,request,receipt) VALUES($1,$2,$3,$4)',[request.id,request.snapshotId,JSON.stringify(request),JSON.stringify(receipt)]);
   return receipt;
  });},
  // Count the entire queue, not only the first page.
  async pendingCount(){return Number((await db.query('SELECT count(*)::bigint AS total FROM offline_sales WHERE synced_at IS NULL')).rows[0]?.total||0);},
  async pending(excludeIds=[]){return (await db.query('SELECT id,request FROM offline_sales WHERE synced_at IS NULL AND NOT (id = ANY($1::uuid[])) ORDER BY created_at,id LIMIT 100',[excludeIds])).rows;},
  async acknowledge(id,receipt){
   // Never mark a sale as synced without a durable, identifiable cloud receipt.
   if(!receipt||typeof receipt.id!=='string'||!receipt.id.trim()||typeof receipt.receiptNumber!=='string'||!receipt.receiptNumber.trim())throw Error('Ungültige Serverbestätigung für Offline-Verkauf.');
   const result=await db.query('UPDATE offline_sales SET synced_at=now(),cloud_receipt=$2,error=NULL WHERE id=$1 AND synced_at IS NULL RETURNING id',[id,JSON.stringify(receipt)]);
   if(result.rows.length!==1)throw Error('Offline-Verkauf konnte nicht als synchronisiert bestätigt werden.');
  },
  async error(id,message){await db.query('UPDATE offline_sales SET error=$2 WHERE id=$1 AND synced_at IS NULL',[id,String(message||'Synchronisierung fehlgeschlagen').slice(0,300)]);}
 };
}

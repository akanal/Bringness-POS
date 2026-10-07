// PGlite is PostgreSQL compiled to WASM. With a file dataDir and default
// durability, the transaction completes only after persistent storage flushes.
export async function createOfflineLedger(db,quote,canonical=JSON.stringify) {
 await db.exec(`CREATE TABLE IF NOT EXISTS offline_catalog(id uuid PRIMARY KEY,payload jsonb NOT NULL,current boolean NOT NULL DEFAULT false);
 CREATE TABLE IF NOT EXISTS offline_sales(id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES offline_catalog(id),request jsonb NOT NULL,receipt jsonb NOT NULL,synced_at timestamptz,cloud_receipt jsonb,error text,created_at timestamptz NOT NULL DEFAULT now());`);
 return {
  async catalog(snapshot){
   return db.transaction(async tx=>{
    const previous=(await tx.query('SELECT payload FROM offline_catalog WHERE current')).rows[0]?.payload;
    if(previous&&previous.companyId!==snapshot.companyId&&(await tx.query('SELECT 1 FROM offline_sales WHERE synced_at IS NULL LIMIT 1')).rows.length)throw Error('Offene Verkäufe zuerst mit dem ursprünglichen Betrieb synchronisieren.');
    await tx.query('UPDATE offline_catalog SET current=false');
    await tx.query('INSERT INTO offline_catalog VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET current=true',[snapshot.id,JSON.stringify(snapshot)]);
   });
  },
  async view(){const snapshot=(await db.query('SELECT payload FROM offline_catalog WHERE current')).rows[0]?.payload;const sales=(await db.query('SELECT receipt,synced_at,cloud_receipt,error FROM offline_sales ORDER BY created_at DESC LIMIT 100')).rows;return {snapshot,sales};},
  async sale(request){return db.transaction(async tx=>{
   const old=(await tx.query('SELECT request,receipt FROM offline_sales WHERE id=$1',[request.id])).rows[0];
   if(old){if(canonical(old.request)!==canonical(request))throw Error('Verkaufskennung bereits verwendet');return old.receipt;}
   const snapshot=(await tx.query("SELECT c.payload FROM offline_catalog c WHERE c.id=$1 AND c.payload->>'companyId'=(SELECT payload->>'companyId' FROM offline_catalog WHERE current)",[request.snapshotId])).rows[0]?.payload;
   if(!snapshot||Date.now()>Date.parse(snapshot.validUntil))throw Error('Offline-Freigabe abgelaufen. Bitte online anmelden.');
   const receipt=quote(snapshot,request);
   await tx.query('INSERT INTO offline_sales(id,snapshot_id,request,receipt) VALUES($1,$2,$3,$4)',[request.id,request.snapshotId,JSON.stringify(request),JSON.stringify(receipt)]);
   return receipt;
  });},
  async pending(){return (await db.query('SELECT id,request FROM offline_sales WHERE synced_at IS NULL ORDER BY created_at,id LIMIT 100')).rows;},
  async acknowledge(id,receipt){await db.query('UPDATE offline_sales SET synced_at=now(),cloud_receipt=$2,error=NULL WHERE id=$1 AND synced_at IS NULL',[id,JSON.stringify(receipt)]);},
  async error(id,message){await db.query('UPDATE offline_sales SET error=$2 WHERE id=$1 AND synced_at IS NULL',[id,String(message).slice(0,300)]);}
 };
}

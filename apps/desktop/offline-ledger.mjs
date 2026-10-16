// PGlite is PostgreSQL compiled to WASM. With a file dataDir and default
// durability, the transaction completes only after persistent storage flushes.
export async function createOfflineLedger(db,quote) {
 await db.exec(`CREATE TABLE IF NOT EXISTS offline_catalog(id uuid PRIMARY KEY,payload jsonb NOT NULL,current boolean NOT NULL DEFAULT false);
 CREATE TABLE IF NOT EXISTS offline_sales(id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES offline_catalog(id),request jsonb NOT NULL,receipt jsonb NOT NULL,synced_at timestamptz,cloud_receipt jsonb,error text,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS offline_sales_pending_idx ON offline_sales(created_at,id) WHERE synced_at IS NULL;
 CREATE INDEX IF NOT EXISTS offline_sales_recent_idx ON offline_sales(created_at DESC,id DESC);
 UPDATE offline_catalog SET current=false WHERE current=true AND id<>(SELECT id FROM offline_catalog WHERE current=true ORDER BY (payload->>'createdAt')::timestamptz DESC NULLS LAST,id DESC LIMIT 1);
 CREATE UNIQUE INDEX IF NOT EXISTS offline_catalog_one_current_idx ON offline_catalog(current) WHERE current=true;`);
 return {
  async catalog(snapshot){
   return db.transaction(async tx=>{
    if(!snapshot||typeof snapshot!=='object'||typeof snapshot.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.id)||typeof snapshot.companyId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.companyId)||!Array.isArray(snapshot.restaurants)||snapshot.restaurants.some(r=>!r||typeof r.id!=='string'||r.id.length!==36||typeof r.name!=='string'||!r.name.trim())||!Array.isArray(snapshot.products)||snapshot.products.some(p=>!p||typeof p.id!=='string'||p.id.length!==36||typeof p.restaurantId!=='string'||p.restaurantId.length!==36||typeof p.name!=='string'||!p.name.trim()||!Number.isSafeInteger(p.priceCents)||p.priceCents<0||!Number.isFinite(p.taxRate)||p.taxRate<0||p.taxRate>100)||!snapshot.merchant||typeof snapshot.merchant!=='object'||Array.isArray(snapshot.merchant)||typeof snapshot.deviceKey!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.deviceKey)||typeof snapshot.createdAt!=='string'||!Number.isFinite(Date.parse(snapshot.createdAt))||typeof snapshot.validUntil!=='string'||!Number.isFinite(Date.parse(snapshot.validUntil))||Date.parse(snapshot.validUntil)<=Date.now()||Date.parse(snapshot.validUntil)<=Date.parse(snapshot.createdAt)||Date.parse(snapshot.createdAt)>Date.now()+60000)throw Error('Offline-Katalog ist ungültig oder abgelaufen.');
    const previous=(await tx.query('SELECT payload FROM offline_catalog WHERE current')).rows[0]?.payload;
    if(previous&&(previous.companyId!==snapshot.companyId||previous.deviceKey!==snapshot.deviceKey)&&(await tx.query('SELECT 1 FROM offline_sales WHERE synced_at IS NULL LIMIT 1')).rows.length)throw Error('Offene Verkäufe zuerst mit dem ursprünglichen Betrieb synchronisieren.');
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
  async sale(request,expectedDeviceKey){return db.transaction(async tx=>{
   if(!request||typeof request!=='object'||Array.isArray(request)||typeof request.id!=='string'||typeof request.snapshotId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.snapshotId))throw Error('Ungültige Offline-Verkaufskennung.');
   if(expectedDeviceKey){
    const current=(await tx.query('SELECT payload->>\'deviceKey\' AS device_key FROM offline_catalog WHERE current')).rows[0];
    if(current?.device_key!==expectedDeviceKey)throw Error('Offline-Katalog gehört nicht zu diesem Gerät.');
   }
   const old=(await tx.query('SELECT s.receipt,s.request=$2::jsonb AS matches,c.payload->>'deviceKey' AS sale_device_key FROM offline_sales s JOIN offline_catalog c ON c.id=s.snapshot_id WHERE s.id=$1',[request.id,JSON.stringify(request)])).rows[0];
   if(old){if(!old.matches)throw Error('Verkaufskennung bereits verwendet');if(expectedDeviceKey&&old.sale_device_key!==expectedDeviceKey)throw Error('Offline-Katalog gehört nicht zu diesem Gerät.');return old.receipt;}
   const snapshot=(await tx.query("SELECT c.payload FROM offline_catalog c WHERE c.id=$1 AND c.payload->>'companyId'=(SELECT payload->>'companyId' FROM offline_catalog WHERE current) AND c.payload->>'deviceKey'=(SELECT payload->>'deviceKey' FROM offline_catalog WHERE current)",[request.snapshotId])).rows[0]?.payload;
   if(!snapshot||typeof snapshot.validUntil!=='string'||!Number.isFinite(Date.parse(snapshot.validUntil))||Date.now()>Date.parse(snapshot.validUntil))throw Error('Offline-Freigabe abgelaufen. Bitte online anmelden.');
   const receipt=quote(snapshot,request);if(!receipt||receipt.id!==request.id||!Array.isArray(receipt.items)||receipt.items.length===0||!Number.isSafeInteger(receipt.totalCents)||receipt.totalCents<=0||receipt.items.some(item=>!item||!Number.isSafeInteger(item.lineCents)||item.lineCents<0)||receipt.items.reduce((sum,item)=>sum+item.lineCents,0)!==receipt.totalCents)throw Error('Ungültiger Offline-Beleg');
   await tx.query('INSERT INTO offline_sales(id,snapshot_id,request,receipt) VALUES($1,$2,$3,$4)',[request.id,request.snapshotId,JSON.stringify(request),JSON.stringify(receipt)]);
   return receipt;
  });},
  // Count the entire queue, not only the first page.
  // Read-only reconciliation export. Never exposes catalog/device credentials.
  async reconciliation({limit=100,onlyPending=false}={}){
   if(!Number.isSafeInteger(limit)||limit<1||limit>500||typeof onlyPending!=='boolean')throw Error('Ungültige Exportauswahl');
   const rows=(await db.query(`SELECT s.id,s.created_at,s.synced_at,s.error,s.receipt,s.cloud_receipt
    FROM offline_sales s WHERE ($1::boolean=false OR s.synced_at IS NULL)
    ORDER BY s.created_at DESC,s.id DESC LIMIT $2`,[onlyPending,limit+1])).rows;
   if(rows.length>limit)throw Error('Der Abgleich enthält mehr als '+limit+' Verkäufe. Kein unvollständiger Export wird gespeichert.');
   return {exportedAt:new Date().toISOString(),onlyPending,total:rows.length,sales:rows.map(row=>({
    offlineId:row.id,createdAt:row.created_at,syncedAt:row.synced_at,
    state:row.synced_at?'synced':row.error?'needs_review':'pending',
    error:row.error,receipt:row.receipt,cloudReceipt:row.cloud_receipt
   }))};
  },
  async pendingCount(){return Number((await db.query('SELECT count(*)::bigint AS total FROM offline_sales WHERE synced_at IS NULL')).rows[0]?.total||0);},
  async pending(excludeIds=[]){if(!Array.isArray(excludeIds)||excludeIds.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))throw Error('Ungültige Ausschlussliste für Offline-Verkäufe');return (await db.query('SELECT id,request FROM offline_sales WHERE synced_at IS NULL AND NOT (id = ANY($1::uuid[])) ORDER BY created_at,id LIMIT 100',[excludeIds])).rows;},
  async acknowledge(id,receipt){
   if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Ungültige Offline-Verkaufskennung');
   // Receipt identity is immutable across retries and process restarts.
   if(!receipt||typeof receipt.id!=='string'||!receipt.id.trim()||receipt.id.length>128||typeof receipt.receiptNumber!=='string'||!receipt.receiptNumber.trim()||receipt.receiptNumber.length>128||(receipt.replayed!==undefined&&typeof receipt.replayed!=='boolean'))throw Error('Ungültige Serverbestätigung für Offline-Verkauf.');
   return db.transaction(async tx=>{
    const sale=(await tx.query('SELECT s.*,c.payload FROM offline_sales s JOIN offline_catalog c ON c.id=s.snapshot_id WHERE s.id=$1 FOR UPDATE OF s',[id])).rows[0];
    if(!sale)throw Error('Offline-Verkauf nicht gefunden.');
    if(sale.synced_at){
     if(sale.cloud_receipt?.id!==receipt.id||sale.cloud_receipt?.receiptNumber!==receipt.receiptNumber)throw Error('Abweichende Bestätigung für bereits synchronisierten Verkauf.');
     return;
    }
    const duplicate=await tx.query(`SELECT s.id FROM offline_sales s JOIN offline_catalog c ON c.id=s.snapshot_id
     WHERE s.id<>$1 AND s.synced_at IS NOT NULL AND c.payload->>'companyId'=$2
     AND (s.cloud_receipt->>'id'=$3 OR (s.request->>'restaurantId'=$4 AND s.cloud_receipt->>'receiptNumber'=$5)) LIMIT 1`,
     [id,sale.payload.companyId,receipt.id,sale.request.restaurantId,receipt.receiptNumber]);
    if(duplicate.rows.length)throw Error('Serverbeleg wurde bereits einem anderen Offline-Verkauf zugeordnet.');
    const result=await tx.query('UPDATE offline_sales SET synced_at=now(),cloud_receipt=$2,error=NULL WHERE id=$1 AND synced_at IS NULL RETURNING id',[id,JSON.stringify(receipt)]);
    if(result.rows.length!==1)throw Error('Offline-Verkauf konnte nicht als synchronisiert bestätigt werden.');
   });
  },
  async error(id,message){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Ungültige Offline-Verkaufskennung');await db.query('UPDATE offline_sales SET error=$2 WHERE id=$1 AND synced_at IS NULL',[id,String(message||'Synchronisierung fehlgeschlagen').slice(0,300)]);}
 };
}

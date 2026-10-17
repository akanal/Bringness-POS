import {readJsonObject} from './http-body.js';
import pg from 'pg';
import crypto from 'node:crypto';
import {quoteOfflineSale,offlineUuid,offlineFingerprint,offlineCatalogValidUntil} from './offline-sale-core.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
export async function migrateOfflineSales(db=pool){await db.query(`
 CREATE TABLE IF NOT EXISTS pos_offline_catalogs(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),device_id uuid NOT NULL REFERENCES devices(id),actor_id uuid NOT NULL REFERENCES users(id),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS pos_offline_sales(id uuid PRIMARY KEY,catalog_id uuid NOT NULL REFERENCES pos_offline_catalogs(id),order_id uuid NOT NULL UNIQUE REFERENCES orders(id),fingerprint text NOT NULL,stock_state text NOT NULL DEFAULT 'pending',stock_error text,created_at timestamptz NOT NULL DEFAULT now());
`);}
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
async function requireOfflineActor(db,user){
 if(!user||!['owner','admin'].includes(user.role)||typeof user.id!=='string'||!offlineUuid.test(user.id)||typeof user.company_id!=='string'||!offlineUuid.test(user.company_id))fail('Betriebsverwaltung nicht mehr zugänglich oder freigegeben',403);
 if(!(await db.query("SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('owner','admin') AND NOT coalesce(must_change_password,false) FOR SHARE",[user.id,user.company_id])).rowCount)fail('Betriebsverwaltung nicht mehr zugänglich oder freigegeben',403);
}
function requireDeviceKey(deviceKey){if(typeof deviceKey!=='string'||!/^[a-f0-9]{64}$/.test(deviceKey))fail('Ungültige Gerätekennung');}
export async function issueOfflineCatalog(db,user,deviceKey){
 requireDeviceKey(deviceKey);
 const c=await db.connect();try{await c.query('BEGIN');await requireOfflineActor(c,user);
 const device=(await c.query(`SELECT d.id,d.license_valid_until FROM devices d JOIN company_entitlements ce ON ce.id=d.entitlement_id JOIN billing_plans bp ON bp.id=ce.plan_id WHERE d.company_id=$1 AND d.device_key=$2 AND d.status='active' AND d.activation_status='active' AND d.license_valid_until>now() AND ce.status='active' AND bp.code='download_license' FOR SHARE OF d,ce,bp`,[user.company_id,deviceKey])).rows[0];
 if(!device)fail('Aktive Download-Lizenz und Gerätefreigabe erforderlich',403);
 const restaurants=(await c.query('SELECT id,name FROM restaurants WHERE company_id=$1 ORDER BY id',[user.company_id])).rows;
 const products=(await c.query('SELECT p.id,p.restaurant_id "restaurantId",p.name,p.price_cents "priceCents",p.tax_rate::float "taxRate" FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE r.company_id=$1 AND p.active AND p.ai_stock_available ORDER BY p.id',[user.company_id])).rows;
 const sellers=(await c.query(`SELECT r.id,jsonb_build_object('businessName',COALESCE(NULLIF(b.company_name,''),c.name),'restaurantName',r.name,'street',COALESCE(b.street,''),'postalCode',COALESCE(b.postal_code,''),'city',COALESCE(b.city,''),'vatId',COALESCE(b.vat_id,'')) seller FROM restaurants r JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE r.company_id=$1`,[user.company_id])).rows;
 const issuedAt=new Date();
 const snapshot={id:crypto.randomUUID(),companyId:user.company_id,deviceKey,createdAt:issuedAt.toISOString(),validUntil:offlineCatalogValidUntil(device.license_valid_until,issuedAt),restaurants,products,merchant:Object.fromEntries(sellers.map(s=>[s.id,s.seller]))};
 const eanFeature=(await c.query("SELECT ends_at,grace_until FROM company_features WHERE company_id=$1 AND feature_code='ean_scanner' AND status='active' AND ((ends_at IS NULL OR ends_at>now()) OR grace_until>now()) FOR SHARE",[user.company_id])).rows[0];
 if(eanFeature){const until=eanFeature.ends_at?Math.max(Date.parse(eanFeature.ends_at),eanFeature.grace_until?Date.parse(eanFeature.grace_until):0):Date.parse(snapshot.validUntil);snapshot.ean={validUntil:new Date(Math.min(Date.parse(snapshot.validUntil),until)).toISOString(),barcodes:(await c.query('SELECT b.restaurant_id "restaurantId",b.product_id "productId",b.code FROM pos_product_barcodes b JOIN restaurants r ON r.id=b.restaurant_id JOIN products p ON p.id=b.product_id AND p.restaurant_id=b.restaurant_id WHERE r.company_id=$1 AND p.active AND p.ai_stock_available',[user.company_id])).rows};}
 await c.query('INSERT INTO pos_offline_catalogs(id,company_id,device_id,actor_id,payload) VALUES($1,$2,$3,$4,$5)',[snapshot.id,user.company_id,device.id,user.id,JSON.stringify(snapshot)]);await c.query('COMMIT');return snapshot;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function importOfflineSale(db,user,deviceKey,request){
 requireDeviceKey(deviceKey);
 if(!request||typeof request!=='object'||Array.isArray(request)||typeof request.id!=='string'||typeof request.snapshotId!=='string'||!offlineUuid.test(request.id)||!offlineUuid.test(request.snapshotId))fail('Ungültiger Offline-Verkauf');
 const c=await db.connect();try{await c.query('BEGIN');await requireOfflineActor(c,user);
 const snapshot=(await c.query(`SELECT s.payload FROM pos_offline_catalogs s JOIN devices d ON d.id=s.device_id WHERE s.id=$1 AND s.company_id=$2 AND d.device_key=$3 FOR SHARE OF s,d`,[request.snapshotId,user.company_id,deviceKey])).rows[0]?.payload;
 if(!snapshot)fail('Offline-Katalog nicht zugänglich',403);
 const receipt=quoteOfflineSale(snapshot,request),fingerprint=offlineFingerprint(receipt);
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[request.id]);
 const old=(await c.query('SELECT s.fingerprint,s.order_id,r.receipt_number FROM pos_offline_sales s JOIN receipts r ON r.order_id=s.order_id WHERE s.id=$1',[request.id])).rows[0];
 if(old){if(old.fingerprint!==fingerprint)fail('Verkaufskennung bereits für andere Daten verwendet',409);await c.query('COMMIT');return {id:old.order_id,receiptNumber:old.receipt_number,replayed:true};}
 if(!(await c.query('SELECT 1 FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[receipt.restaurantId,user.company_id])).rowCount)fail('Betrieb nicht mehr zugänglich',403);
 // Import historical completed sales, never re-open a payment or kitchen ticket.
 // The database stock guard recognizes this transaction-local trusted import.
 await c.query("SELECT set_config('bringness.offline_import','true',true)");
 const order=(await c.query("INSERT INTO orders(restaurant_id,source,status,total_cents,created_at,closed_at) VALUES($1,'offline','paid',$2,$3,$3) RETURNING id",[receipt.restaurantId,receipt.totalCents,receipt.createdAt])).rows[0];
 for(const i of receipt.items)await c.query('INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5,$6)',[order.id,i.productId,i.name,i.unitPriceCents,i.taxRate,i.quantity]);
 await c.query("INSERT INTO payments(order_id,method,amount_cents,created_at) VALUES($1,'cash',$2,$3)",[order.id,receipt.totalCents,receipt.createdAt]);
 await c.query("INSERT INTO receipts(order_id,receipt_number,issued_at,merchant_snapshot) VALUES($1,$2,$3,$4)",[order.id,receipt.receiptNumber,receipt.createdAt,JSON.stringify(receipt.merchant)]);
 await c.query('INSERT INTO pos_offline_sales(id,catalog_id,order_id,fingerprint,stock_state) VALUES($1,$2,$3,$4,$5)',[request.id,request.snapshotId,order.id,fingerprint,'pending']);
 await c.query("INSERT INTO audit_log(company_id,restaurant_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,'offline_sale_imported','order',$4,$5)",[user.company_id,receipt.restaurantId,user.id,order.id,JSON.stringify({offlineId:request.id,snapshotId:request.snapshotId,totalCents:receipt.totalCents})]);
 await c.query('COMMIT');return {id:order.id,receiptNumber:receipt.receiptNumber,stockState:'pending'};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function handleOfflineSales(req,res,{db=pool}={}){
 const path=new URL(req.url,'http://local').pathname;if(!['/api/v1/offline/catalog','/api/v1/offline/sales','/api/v1/offline/status','/api/v1/offline/summary','/api/v1/offline/retry','/api/v1/offline/batch'].includes(path))return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
 try{
  if(req.method!=='POST'&&!((path.endsWith('/status')||path.endsWith('/summary'))&&req.method==='GET'))return send(405,{error:'Methode nicht erlaubt'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const user=(await db.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!user)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin'].includes(user.role))return send(403,{error:'Nur Betriebsverwaltung'});
  if(path.endsWith('/summary')){
   const restaurantId=new URL(req.url,'http://local').searchParams.get('restaurantId');
   if(restaurantId!==null&&!offlineUuid.test(restaurantId))fail('Ungültige Betriebskennung');
   const rows=(await db.query(
    "SELECT s.stock_state, count(*)::integer AS count FROM pos_offline_sales s JOIN pos_offline_catalogs c ON c.id=s.catalog_id JOIN orders o ON o.id=s.order_id WHERE c.company_id=$1 AND ($2::uuid IS NULL OR o.restaurant_id=$2) GROUP BY s.stock_state ORDER BY s.stock_state",
    [user.company_id,restaurantId])).rows;
   const counts={pending:0,applied:0,conflict:0};
   for(const row of rows)counts[row.stock_state]=row.count;
   return send(200,{counts,total:rows.reduce((sum,row)=>sum+row.count,0),restaurantId});
  }
  if(path.endsWith('/status')){
   const params=new URL(req.url,'http://local').searchParams;
   const state=params.get('state');
   if(state!==null&&!['pending','applied','conflict'].includes(state))fail('Ungültiger Lagerstatus');
   const limitText=params.get('limit')||'100';
   if(!/^[1-9][0-9]{0,2}$/.test(limitText)||Number(limitText)>100)fail('Limit muss zwischen 1 und 100 liegen');
   const limit=Number(limitText);
   const restaurantId=params.get('restaurantId');
   if(restaurantId!==null&&!offlineUuid.test(restaurantId))fail('Ungültige Betriebskennung');
   const sales=(await db.query(
    'SELECT s.id,s.order_id,s.stock_state,s.stock_error,s.created_at,r.receipt_number FROM pos_offline_sales s JOIN pos_offline_catalogs c ON c.id=s.catalog_id JOIN receipts r ON r.order_id=s.order_id JOIN orders o ON o.id=s.order_id WHERE c.company_id=$1 AND ($2::text IS NULL OR s.stock_state=$2) AND ($4::uuid IS NULL OR o.restaurant_id=$4) ORDER BY s.created_at DESC,s.id DESC LIMIT $3',
    [user.company_id,state,limit,restaurantId])).rows;
   return send(200,{sales,filters:{state,limit,restaurantId}});
  }
  const b=await readJsonObject(req,{maxBytes:path.endsWith('/batch')?262144:64000});
  if(path.endsWith('/batch')){
   if(!b||typeof b!=='object'||!/^[a-f0-9]{64}$/.test(b.deviceKey||''))fail('Ungültige Gerätekennung');
   if(!Array.isArray(b.sales)||b.sales.length<1||b.sales.length>20)fail('1 bis 20 Offline-Verkäufe pro Synchronisierung erforderlich');
   const results=[];
   for(const sale of b.sales){
    try{
     const result=await importOfflineSale(db,user,b.deviceKey,sale);
     results.push({offlineId:sale?.id||null,ok:true,...result});
    }catch(error){
     results.push({offlineId:typeof sale?.id==='string'?sale.id:null,ok:false,
      status:error.status||503,error:error.status?error.message:'Synchronisierung momentan nicht verfügbar'});
    }
   }
   return send(200,{results,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length});
  }
  if(path.endsWith('/retry')){if(!b||typeof b!=='object'||!offlineUuid.test(b.id||''))fail('Ungültige Verkaufskennung');const result=await db.query("UPDATE pos_offline_sales s SET stock_state='pending',stock_error=NULL FROM pos_offline_catalogs c WHERE s.catalog_id=c.id AND c.company_id=$1 AND s.id=$2 AND s.stock_state='conflict'",[user.company_id,b.id]);if(!result.rowCount)fail('Kein zugänglicher Lagerkonflikt',404);return send(200,{ok:true})}
  if(!b||typeof b!=='object'||!/^[a-f0-9]{64}$/.test(b.deviceKey||''))fail('Ungültige Gerätekennung');
  return send(200,path.endsWith('/catalog')?{snapshot:await issueOfflineCatalog(db,user,b.deviceKey)}:await importOfflineSale(db,user,b.deviceKey,b.sale));
 }catch(e){return send(e.status||503,{error:e.status?e.message:'Offline-Synchronisierung momentan nicht verfügbar'});}
}

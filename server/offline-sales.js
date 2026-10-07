import pg from 'pg';
import crypto from 'node:crypto';
import {quoteOfflineSale,offlineUuid,offlineFingerprint} from './offline-sale-core.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
export async function migrateOfflineSales(db=pool){await db.query(`
 CREATE TABLE IF NOT EXISTS pos_offline_catalogs(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),device_id uuid NOT NULL REFERENCES devices(id),actor_id uuid NOT NULL REFERENCES users(id),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS pos_offline_sales(id uuid PRIMARY KEY,catalog_id uuid NOT NULL REFERENCES pos_offline_catalogs(id),order_id uuid NOT NULL UNIQUE REFERENCES orders(id),fingerprint text NOT NULL,stock_state text NOT NULL DEFAULT 'pending',stock_error text,created_at timestamptz NOT NULL DEFAULT now());
`);}
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function issueOfflineCatalog(db,user,deviceKey){
 const device=(await db.query(`SELECT d.id,d.license_valid_until FROM devices d JOIN company_entitlements ce ON ce.id=d.entitlement_id JOIN billing_plans bp ON bp.id=ce.plan_id WHERE d.company_id=$1 AND d.device_key=$2 AND d.status='active' AND d.activation_status='active' AND d.license_valid_until>now() AND ce.status='active' AND bp.code='download_license'`,[user.company_id,deviceKey])).rows[0];
 if(!device)fail('Aktive Download-Lizenz und Gerätefreigabe erforderlich',403);
 const restaurants=(await db.query('SELECT id,name FROM restaurants WHERE company_id=$1 ORDER BY id',[user.company_id])).rows;
 const products=(await db.query('SELECT p.id,p.restaurant_id "restaurantId",p.name,p.price_cents "priceCents",p.tax_rate::float "taxRate" FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE r.company_id=$1 AND p.active AND p.ai_stock_available ORDER BY p.id',[user.company_id])).rows;
 const sellers=(await db.query(`SELECT r.id,jsonb_build_object('businessName',COALESCE(NULLIF(b.company_name,''),c.name),'restaurantName',r.name,'street',COALESCE(b.street,''),'postalCode',COALESCE(b.postal_code,''),'city',COALESCE(b.city,''),'vatId',COALESCE(b.vat_id,'')) seller FROM restaurants r JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE r.company_id=$1`,[user.company_id])).rows;
 const snapshot={id:crypto.randomUUID(),companyId:user.company_id,deviceKey,createdAt:new Date().toISOString(),validUntil:new Date(device.license_valid_until).toISOString(),restaurants,products,merchant:Object.fromEntries(sellers.map(s=>[s.id,s.seller]))};
 await db.query('INSERT INTO pos_offline_catalogs(id,company_id,device_id,actor_id,payload) VALUES($1,$2,$3,$4,$5)',[snapshot.id,user.company_id,device.id,user.id,JSON.stringify(snapshot)]);return snapshot;
}
export async function importOfflineSale(db,user,deviceKey,request){
 if(!offlineUuid.test(request?.id||'')||!offlineUuid.test(request?.snapshotId||''))fail('Ungültiger Offline-Verkauf');
 const c=await db.connect();try{await c.query('BEGIN');
 const snapshot=(await c.query(`SELECT s.payload FROM pos_offline_catalogs s JOIN devices d ON d.id=s.device_id WHERE s.id=$1 AND s.company_id=$2 AND d.device_key=$3 AND d.company_id=$2 FOR SHARE OF s,d`,[request.snapshotId,user.company_id,deviceKey])).rows[0]?.payload;
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
 const stock=(await c.query('SELECT 1 FROM pos_stock_links WHERE restaurant_id=$1 AND active',[receipt.restaurantId])).rowCount;
 await c.query('INSERT INTO pos_offline_sales(id,catalog_id,order_id,fingerprint,stock_state) VALUES($1,$2,$3,$4,$5)',[request.id,request.snapshotId,order.id,fingerprint,'pending']);
 await c.query("INSERT INTO audit_log(company_id,restaurant_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,'offline_sale_imported','order',$4,$5)",[user.company_id,receipt.restaurantId,user.id,order.id,JSON.stringify({offlineId:request.id,snapshotId:request.snapshotId,totalCents:receipt.totalCents})]);
 await c.query('COMMIT');return {id:order.id,receiptNumber:receipt.receiptNumber,stockState:'pending'};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function handleOfflineSales(req,res){
 const path=new URL(req.url,'http://local').pathname;if(!['/api/v1/offline/catalog','/api/v1/offline/sales','/api/v1/offline/status','/api/v1/offline/retry'].includes(path))return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
 try{
  if(req.method!=='POST'&&!(path.endsWith('/status')&&req.method==='GET'))return send(405,{error:'Methode nicht erlaubt'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const user=(await pool.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!user)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin'].includes(user.role))return send(403,{error:'Nur Betriebsverwaltung'});
  if(path.endsWith('/status'))return send(200,{sales:(await pool.query('SELECT s.id,s.order_id,s.stock_state,s.stock_error,s.created_at,r.receipt_number FROM pos_offline_sales s JOIN pos_offline_catalogs c ON c.id=s.catalog_id JOIN receipts r ON r.order_id=s.order_id WHERE c.company_id=$1 ORDER BY s.created_at DESC LIMIT 100',[user.company_id])).rows});
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64000)fail('Anfrage zu groß',413)}let b;try{b=JSON.parse(raw)}catch{fail('Ungültige Anfrage')}
  if(path.endsWith('/retry')){if(!offlineUuid.test(b.id||''))fail('Ungültige Verkaufskennung');const result=await pool.query("UPDATE pos_offline_sales s SET stock_state='pending',stock_error=NULL FROM pos_offline_catalogs c WHERE s.catalog_id=c.id AND c.company_id=$1 AND s.id=$2 AND s.stock_state='conflict'",[user.company_id,b.id]);if(!result.rowCount)fail('Kein zugänglicher Lagerkonflikt',404);return send(200,{ok:true})}
  if(!/^[a-f0-9]{64}$/.test(b.deviceKey||''))fail('Ungültige Gerätekennung');
  return send(200,path.endsWith('/catalog')?{snapshot:await issueOfflineCatalog(pool,user,b.deviceKey)}:await importOfflineSale(pool,user,b.deviceKey,b.sale));
 }catch(e){return send(e.status||503,{error:e.status?e.message:'Offline-Synchronisierung momentan nicht verfügbar'});}
}

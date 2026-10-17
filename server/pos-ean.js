import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function validEan(code){
 if(typeof code!=='string'||!/^([0-9]{8}|[0-9]{12,14})$/.test(code))return false;
 let sum=0,weight=3;for(let i=code.length-2;i>=0;i--){sum+=Number(code[i])*weight;weight=4-weight}
 return (10-sum%10)%10===Number(code.at(-1));
}
export async function migratePosEan(pool){await pool.query(`CREATE TABLE IF NOT EXISTS pos_product_barcodes(restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,code text NOT NULL,product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(restaurant_id,code));CREATE INDEX IF NOT EXISTS pos_barcode_product_idx ON pos_product_barcodes(product_id);`)}
export async function eanAccess(db,companyId){
 const rows=(await db.query("SELECT feature_code,ends_at FROM company_features WHERE company_id=$1 AND status='active' AND ((ends_at IS NULL OR ends_at>now()) OR grace_until>now()) FOR SHARE",[companyId])).rows;
 if(!rows.some(r=>r.feature_code==='ean_scanner'))return false;
 return rows.some(r=>['pos_base','restaurant'].includes(r.feature_code))||Boolean((await db.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active' FOR SHARE OF ce",[companyId])).rowCount);
}
export function createPosEan(pool){return async(req,res)=>{
 const url=new URL(req.url,'http://local');if(url.pathname!=='/api/v1/ean')return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
 if(!['GET','POST'].includes(req.method))return send(405,{error:'Methode nicht erlaubt'});
 let c;try{
 const b=req.method==='GET'?Object.fromEntries(url.searchParams):await readJsonObject(req,{maxBytes:8192});
 if(!uuid(b.restaurantId)||!validEan(b.code))return send(400,{error:'Gültigen EAN-/GTIN-Code mit Prüfziffer und Betrieb angeben.'});
 const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!raw)return send(401,{error:'Bitte anmelden'});
 c=await pool.connect();await c.query('BEGIN');
 const u=(await c.query("SELECT u.id,u.company_id,u.role,s.token_hash session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR SHARE OF s,u",[digest(raw)])).rows[0];
 if(!u)fail('Bitte erneut anmelden',401);if(u.role==='waiter')fail('Kassenberechtigung erforderlich',403);
 if(!(await c.query('SELECT 1 FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[b.restaurantId,u.company_id])).rowCount)fail('Betrieb nicht gefunden',404);
 if(!await eanAccess(c,u.company_id))fail('EAN-Scanner-Modul und Grundkasse erforderlich',402);
 if(req.method==='GET'){
 const product=(await c.query('SELECT p.id,p.name,p.active,p.ai_stock_available FROM pos_product_barcodes b JOIN products p ON p.id=b.product_id AND p.restaurant_id=b.restaurant_id WHERE b.restaurant_id=$1 AND b.code=$2',[b.restaurantId,b.code])).rows[0];
 if(product&&(!product.active||!product.ai_stock_available))fail('Artikel ist derzeit nicht verfügbar.',409);
 await c.query('COMMIT');return send(200,{product:product?{id:product.id,name:product.name}:null});
 }
 if(!['owner','admin'].includes(u.role))fail('Nur die Betriebsverwaltung darf Barcodes zuordnen.',403);
 const unlock=String(req.headers['x-personnel-unlock']||'');if(!unlock||!(await c.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() FOR SHARE',[digest(unlock),u.session_hash,u.id])).rowCount)fail('Verwaltungs-PIN erforderlich',403);
 const old=(await c.query('SELECT product_id FROM pos_product_barcodes WHERE restaurant_id=$1 AND code=$2',[b.restaurantId,b.code])).rows[0];
 if(old){if(b.productId!==old.product_id)fail('Dieser Code ist bereits einem Artikel zugeordnet.',409);await c.query('COMMIT');return send(200,{productId:old.product_id,replayed:true})}
 let productId=b.productId;
 if(productId){if(!uuid(productId)||!(await c.query('SELECT 1 FROM products WHERE id=$1 AND restaurant_id=$2 AND active=true FOR SHARE',[productId,b.restaurantId])).rowCount)fail('Artikel nicht im gewählten Betrieb gefunden',404)}
 else{
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>150||!Number.isSafeInteger(b.priceCents)||b.priceCents<1||b.priceCents>100000000||![0,7,19].includes(b.taxRate))fail('Artikelname, positiver Preis und Steuersatz erforderlich.');
 productId=(await c.query('INSERT INTO products(restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,$3,$4) RETURNING id',[b.restaurantId,b.name.trim(),b.priceCents,b.taxRate])).rows[0].id;
 }
 await c.query('INSERT INTO pos_product_barcodes(restaurant_id,code,product_id) VALUES($1,$2,$3)',[b.restaurantId,b.code,productId]);
 await c.query("INSERT INTO audit_log(company_id,restaurant_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,'ean.assigned','product',$4,$5)",[u.company_id,b.restaurantId,u.id,productId,JSON.stringify({code:b.code})]);
 await c.query('COMMIT');return send(201,{productId});
 }catch(e){if(c)await c.query('ROLLBACK');return send(e.code==='23505'?409:e.status||500,{error:e.code==='23505'?'Dieser Code wurde bereits zugeordnet. Bitte erneut scannen.':e.status?e.message:'EAN-Verarbeitung fehlgeschlagen.'})}finally{c?.release()}
}}

import {readJsonObject} from './http-body.js';
import {normalizeDiscount} from './sale-discount.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function migrateParkedBons(db){await db.query(`CREATE TABLE IF NOT EXISTS pos_parked_bons(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),restaurant_id uuid NOT NULL REFERENCES restaurants(id),label text NOT NULL,payload jsonb NOT NULL,version int NOT NULL DEFAULT 1,state text NOT NULL DEFAULT 'parked' CHECK(state IN ('parked','paid')),order_id uuid REFERENCES orders(id),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());CREATE INDEX IF NOT EXISTS pos_parked_bons_restaurant ON pos_parked_bons(restaurant_id,state);ALTER TABLE receipts ADD COLUMN IF NOT EXISTS sale_adjustment jsonb;`)}
function payload(b){
 const mode=b.salesMode||'retail',items=b.items;if(!['retail','trade'].includes(mode)||!Array.isArray(items)||!items.length||items.length>100)throw Error('Betriebsart und Artikel erforderlich');
 const clean=items.map(i=>{if(!i||!uuid.test(i.productId||'')||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>(mode==='trade'?999999:999))throw Error('Ungültige Artikelmenge');return {productId:i.productId.toLowerCase(),qty:i.qty}}).sort((a,b)=>a.productId.localeCompare(b.productId));
 if(new Set(clean.map(i=>i.productId)).size!==clean.length)throw Error('Artikel doppelt');
 const recipient={};if(mode==='trade')for(const [k,max]of Object.entries({name:160,street:160,postalCode:20,city:100,country:80,vatId:40})){const v=b.recipient?.[k]??'';if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw Error('Ungültige Empfängerdaten');recipient[k]=v.trim();}
 return {salesMode:mode,items:clean,discount:normalizeDiscount(b.discount),...(mode==='trade'?{recipient}:{})};
}
export function createParkedBons(pool,authenticate){return async(req,res)=>{
 const url=new URL(req.url,'http://local'),m=url.pathname.match(/^\/api\/v1\/parked-bons(?:\/([a-f0-9-]+))?$/i);if(!m)return false;
 const send=(s,b)=>{res.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(b));return true};
 const u=await authenticate(req);if(!u)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin','manager'].includes(u.role))return send(403,{error:'Kein Kassenzugang'});
 if(req.method==='GET'){if(m[1]){if(!uuid.test(m[1]))return send(400,{error:'Ungültiger Bon'});const r=await pool.query('SELECT id,restaurant_id,label,payload,version,state,order_id FROM pos_parked_bons WHERE id=$1 AND company_id=$2',[m[1],u.company_id]);return r.rows[0]?send(200,r.rows[0]):send(404,{error:'Bon nicht gefunden'});}const rid=url.searchParams.get('restaurantId');if(!uuid.test(rid||''))return send(400,{error:'Betrieb erforderlich'});return send(200,{bons:(await pool.query("SELECT b.id,b.label,b.version,b.payload->>'salesMode' sales_mode,b.created_at FROM pos_parked_bons b JOIN restaurants r ON r.id=b.restaurant_id WHERE b.restaurant_id=$1 AND r.company_id=$2 AND b.company_id=$2 AND b.state='parked' ORDER BY b.created_at DESC LIMIT 200",[rid,u.company_id])).rows});}
 if(!['POST','PUT'].includes(req.method)||req.method==='PUT'&&!m[1]||req.method==='POST'&&m[1])return send(405,{error:'Methode nicht erlaubt'});
 let b,d,label,id;try{b=await readJsonObject(req,{maxBytes:16384});d=payload(b);label=String(b.label||'').trim();id=m[1]||b.id;if(!uuid.test(id||'')||!uuid.test(b.restaurantId||'')||!label||label.length>80||/[\x00-\x1f]/.test(label))throw Error('Bonname und Betrieb erforderlich');if(req.method==='PUT'&&(!Number.isSafeInteger(b.version)||b.version<1))throw Error('Bonversion erforderlich')}catch(e){return send(400,{error:e.message})}
 const c=await pool.connect();try{await c.query('BEGIN');const actor=await authenticate(req,c,true);if(!actor||actor.id!==u.id||actor.company_id!==u.company_id||!['owner','admin','manager'].includes(actor.role))throw Object.assign(Error('Zugang abgelaufen'),{status:403});
 if(!(await c.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[b.restaurantId,u.company_id])).rows.length)throw Object.assign(Error('Betrieb nicht erlaubt'),{status:403});
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['park:'+id]);
 const old=(await c.query('SELECT * FROM pos_parked_bons WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(req.method==='POST'&&old){if(old.company_id!==u.company_id||old.restaurant_id!==b.restaurantId||old.label!==label||JSON.stringify(old.payload)!==JSON.stringify(d)){
 // PostgreSQL jsonb key order is not the original JS key order.
 const matches=old.company_id===u.company_id&&old.restaurant_id===b.restaurantId&&old.label===label&&(await c.query('SELECT payload=$2::jsonb matches FROM pos_parked_bons WHERE id=$1',[id,JSON.stringify(d)])).rows[0]?.matches;
 if(!matches)throw Object.assign(Error('Bonkennung bereits anders verwendet'),{status:409});}
 if(old.state!=='parked')throw Object.assign(Error('Dieser Bon wurde bereits bezahlt'),{status:409});await c.query('COMMIT');return send(200,{id,version:old.version});}
 if(req.method==='PUT'){if(!old||old.company_id!==u.company_id||old.restaurant_id!==b.restaurantId)throw Object.assign(Error('Bon nicht gefunden'),{status:404});
 if(old.state!=='parked')throw Object.assign(Error('Bon bereits bezahlt'),{status:409});
 const same=(await c.query('SELECT payload=$2::jsonb AND label=$3 matches FROM pos_parked_bons WHERE id=$1',[id,JSON.stringify(d),label])).rows[0].matches;
 if(old.version!==b.version&&!same)throw Object.assign(Error('Bon wurde zwischenzeitlich geändert. Neu laden.'),{status:409});
 if(!same)await c.query('UPDATE pos_parked_bons SET payload=$2::jsonb,label=$3,version=version+1,updated_at=now() WHERE id=$1',[id,JSON.stringify(d),label]);
 await c.query('COMMIT');return send(200,{id,version:same?old.version:old.version+1});}
 await c.query('INSERT INTO pos_parked_bons(id,company_id,restaurant_id,label,payload,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[id,u.company_id,b.restaurantId,label,JSON.stringify(d),u.id]);await c.query('COMMIT');return send(201,{id,version:1});
 }catch(e){await c.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e}finally{c.release()}
};}

import {csvMenuPreview} from './menu-import-csv.js';
import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
import {menuPreview,reviewedMenu,menuKey,menuDigest,menuFail} from './menu-import-core.js';
import {recognizeMenuFile} from './menu-import-recognition.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export async function migrateMenuImport(db){await db.query(`CREATE TABLE IF NOT EXISTS menu_import_receipts(
 restaurant_id uuid NOT NULL REFERENCES restaurants(id),request_id uuid NOT NULL,company_id uuid NOT NULL REFERENCES companies(id),
 request_hash text NOT NULL,result jsonb NOT NULL,actor_id uuid REFERENCES users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(restaurant_id,request_id));`)}
async function menuActor(db,req){
 const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const actor=raw?(await db.query(`SELECT u.id,u.company_id,u.role,EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active=true) platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,[hash(raw)])).rows[0]:null;
 if(!actor)menuFail('Bitte anmelden.',401);return actor;
}
async function authorize(db,req,b,{lock=false}={}){
 const actor=await menuActor(db,req);
 if(b.registerId){
  if(!uuid.test(b.registerId)||!actor.platform_admin)menuFail('Nur freigeschaltete Plattformadministratoren.',403);
  const r=(await db.query(`SELECT r.id,r.company_id,r.name FROM online_registers o JOIN devices d ON d.id=o.device_id JOIN restaurants r ON r.id=o.restaurant_id
   JOIN users owner ON owner.id=o.granted_by AND owner.company_id=d.company_id AND owner.status='active' AND owner.role IN ('owner','admin') AND NOT coalesce(owner.must_change_password,false)
   WHERE o.device_id=$1 AND d.status='active' AND o.management_until>now() ${lock?'FOR UPDATE OF o,r':''}`,[b.registerId])).rows[0];
  if(!r)menuFail('Keine aktive Kundenfreigabe für diese Kasse.',403);return {actor,restaurant:r};
 }
 if(!['owner','admin'].includes(actor.role))menuFail('Nur Inhaber und Administratoren.',403);
 if(!uuid.test(b.restaurantId||''))menuFail('Bitte Betrieb auswählen.');
 const r=(await db.query('SELECT id,company_id,name FROM restaurants WHERE id=$1 AND company_id=$2'+(lock?' FOR UPDATE':''),[b.restaurantId,actor.company_id])).rows[0];if(!r)menuFail('Betrieb nicht gefunden.',404);return {actor,restaurant:r};
}
export function createMenuImport(pool,{recognize=recognizeMenuFile}={}){
 const attempts=new Map();
 return async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;if(!path.startsWith('/api/v1/menu-import/'))return false;
  const send=(s,d)=>{res.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(d));return true};
  try{
   if(req.method!=='POST'||!['/api/v1/menu-import/preview','/api/v1/menu-import/commit'].includes(path))return send(405,{error:'Methode nicht erlaubt.'});
   // Reject unauthenticated uploads before reading their potentially large bodies.
   await menuActor(pool,req);
   const b=await readJsonObject(req,{maxBytes:path.endsWith('/preview')?11500000:100000});
   const initial=await authorize(pool,req,b);
   if(path.endsWith('/preview')){
    const now=Date.now();for(const [key,value] of attempts)if(now-value.at>60000)attempts.delete(key);
    const rate=attempts.get(initial.actor.id);if(rate&&rate.count>=6)menuFail('Bitte eine Minute bis zur nächsten Vorschau warten.',429);if(!rate&&attempts.size>=500)menuFail('Vorschau momentan ausgelastet.',429);attempts.set(initial.actor.id,{at:rate?.at||now,count:(rate?.count||0)+1});
    const extracted=b.csv!==undefined?{text:b.csv,confidence:null}:b.data?await recognize(b):{text:b.text,confidence:null};
    await authorize(pool,req,b);const draft=b.csv!==undefined?csvMenuPreview(extracted.text,b.csvOptions):menuPreview(extracted.text);
    const existing=(await pool.query('SELECT p.name,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.restaurant_id=$1',[initial.restaurant.id])).rows;
    for(const row of draft.rows)if(existing.some(p=>menuKey(p.name)===menuKey(row.name)&&menuKey(p.category)===menuKey(row.category))){row.selected=false;row.warning='Artikel in dieser Kategorie bereits vorhanden. Bestehende Artikel werden nicht überschrieben.'}
    return send(200,{...draft,confidence:extracted.confidence,restaurant:{id:initial.restaurant.id,name:initial.restaurant.name},...(extracted.confidence!==null&&extracted.confidence<60?{recognitionWarning:'Texterkennung unsicher. Alle Angaben mit dem Original vergleichen.'}:{})});
   }
   if(!uuid.test(b.requestId||''))menuFail('Sichere Importkennung fehlt.');
   const rows=reviewedMenu(b),digest=menuDigest(rows),db=await pool.connect();
   try{
    await db.query('BEGIN');const {actor,restaurant:r}=await authorize(db,req,b,{lock:true});
    const previous=(await db.query('SELECT request_hash,result FROM menu_import_receipts WHERE restaurant_id=$1 AND request_id=$2',[r.id,b.requestId])).rows[0];
    if(previous){if(previous.request_hash!==digest)menuFail('Diese Importkennung wurde bereits mit anderen Angaben verwendet.',409);await db.query('COMMIT');return send(200,{...previous.result,replayed:true})}
    const categories=(await db.query('SELECT id,name,active FROM categories WHERE restaurant_id=$1',[r.id])).rows,products=(await db.query('SELECT p.name,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.restaurant_id=$1',[r.id])).rows;
    const mapping=new Map();let createdCategories=0;const ids=[];
    for(const row of rows){
     const key=menuKey(row.category);if(!mapping.has(key)){
      const candidates=categories.filter(c=>menuKey(c.name)===key);if(candidates.length>1)menuFail('Kategorie ist mehrfach vorhanden: '+row.category,409);if(candidates[0]?.active===false)menuFail('Kategorie ist inaktiv: '+row.category,409);
      const category=candidates[0]||(await db.query('INSERT INTO categories(restaurant_id,name) VALUES($1,$2) RETURNING id,name,active',[r.id,row.category])).rows[0];if(!candidates.length)createdCategories++;mapping.set(key,category.id);
     }
     if(products.some(p=>menuKey(p.name)===menuKey(row.name)&&menuKey(p.category)===key))menuFail('Bereits vorhandenen Artikel abwählen: '+row.name,409);
     const p=(await db.query('INSERT INTO products(restaurant_id,category_id,name,price_cents,tax_rate,active) VALUES($1,$2,$3,$4,$5,true) RETURNING id',[r.id,mapping.get(key),row.name,row.price_cents,row.tax_rate])).rows[0];ids.push(p.id);
    }
    const result={ok:true,restaurantId:r.id,productsCreated:ids.length,categoriesCreated:createdCategories,productIds:ids};
    await db.query('INSERT INTO menu_import_receipts(restaurant_id,request_id,company_id,request_hash,result,actor_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[r.id,b.requestId,r.company_id,digest,JSON.stringify(result),actor.id]);
    await db.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'menu_import.committed','restaurant',$3,$4::jsonb)",[r.company_id,actor.id,r.id,JSON.stringify({requestId:b.requestId,productsCreated:ids.length,categoriesCreated:createdCategories})]);
    await db.query('COMMIT');return send(201,result);
   }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
  }catch(e){return send(e.status||503,{error:e.status?e.message:'Speisekartenimport momentan nicht verfügbar.'})}
 };
}

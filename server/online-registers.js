import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const text=(v,max,min=0)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail('Ungültiger Text.');return v.trim()};
export async function migrateOnlineRegisters(db){await db.query(`
 CREATE TABLE IF NOT EXISTS online_registers(
 device_id uuid PRIMARY KEY REFERENCES devices(id),restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 management_until timestamptz,granted_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS online_registers_restaurant ON online_registers(restaurant_id);
`)}
export function createOnlineRegisters(pool){return async(req,res)=>{
 const url=new URL(req.url,'http://local'),p=url.pathname,base='/api/v1/online-registers';
 if(p!==base&&!p.startsWith(base+'/'))return false;
 const send=(s,d)=>{res.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(d));return true};
 const db=await pool.connect();let transaction=false;
 try{
  await db.query('BEGIN');transaction=true;
  const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const actor=raw?(await db.query(`SELECT u.id,u.company_id,u.role,
   EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active=true) platform_admin
   FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()
   AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,[digest(raw)])).rows[0]:null;
  if(!actor)fail('Bitte anmelden.',401);
  const b=['POST','PUT'].includes(req.method)?await readJsonObject(req,{maxBytes:32768}):{};
  let result,status=200;
  const audit=async(device,event,payload={})=>db.query(`INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload)
   VALUES($1,$2,$3,'device',$4,$5::jsonb)`,[device.company_id,actor.id,'online_register.'+event,device.id,JSON.stringify(payload)]);
  if(p===base+'/self'&&req.method==='POST'){
   if(!['owner','admin','manager','cashier'].includes(actor.role))fail('Keine Kassenberechtigung.',403);
   if(!uuid.test(b.restaurantId||'')||!/^[a-f0-9]{64}$/.test(b.deviceKey||''))fail('Ungültige Kassenkennung.');
   const r=(await db.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2',[b.restaurantId,actor.company_id])).rows[0];
   if(!r)fail('Betrieb nicht freigegeben.',403);
   // A key may never be moved between tenants or restaurants.
   const d=(await db.query(`INSERT INTO devices(company_id,device_key,name,platform,app_version,last_seen_at)
    VALUES($1,$2,'Online-Kasse','browser',$3,now()) ON CONFLICT(device_key) DO UPDATE SET last_seen_at=now(),app_version=EXCLUDED.app_version
    WHERE devices.company_id=EXCLUDED.company_id AND devices.platform='browser' AND devices.status='active' RETURNING id,company_id,status`,[actor.company_id,b.deviceKey,'web-20261113'])).rows[0];
   if(!d)fail('Kassenkennung nicht verfügbar.',409);
   await db.query('INSERT INTO online_registers(device_id,restaurant_id) VALUES($1,$2) ON CONFLICT(device_id) DO NOTHING',[d.id,r.id]);
   const reg=(await db.query('SELECT restaurant_id,management_until FROM online_registers WHERE device_id=$1',[d.id])).rows[0];
   if(reg.restaurant_id!==r.id)fail('Kasse gehört zu einem anderen Betrieb.',409);
   result={id:d.id,...reg};
  }else if(p===base+'/grant'&&req.method==='POST'){
   if(!['owner','admin'].includes(actor.role))fail('Nur Inhaber und Administratoren.',403);
   if(!uuid.test(b.id||'')||typeof b.enabled!=='boolean')fail('Ungültige Freigabe.');
   const d=(await db.query(`SELECT d.id,d.company_id FROM devices d JOIN online_registers o ON o.device_id=d.id
    WHERE d.id=$1 AND d.company_id=$2 AND d.status='active' FOR UPDATE OF o`,[b.id,actor.company_id])).rows[0];
   if(!d)fail('Kasse nicht gefunden.',404);
   const grant=(await db.query(`UPDATE online_registers SET management_until=CASE WHEN $2 THEN now()+interval '1 hour' ELSE NULL END,
    granted_by=$3,updated_at=now() WHERE device_id=$1 RETURNING management_until`,[d.id,b.enabled,actor.id])).rows[0];
   await audit(d,b.enabled?'granted':'revoked');result=grant;
  }else{
   if(!actor.platform_admin)fail('Nur freigeschaltete Plattformadministratoren.',403);
   if(p===base&&req.method==='GET'){
    const q=String(url.searchParams.get('q')||'').trim();if(q.length>100)fail('Suchbegriff zu lang.');
    result={registers:(await db.query(`SELECT d.id,d.name,d.status,d.last_seen_at,o.restaurant_id,o.management_until,
     r.name restaurant_name,c.name company_name FROM online_registers o JOIN devices d ON d.id=o.device_id
     JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=d.company_id
     WHERE ($1='' OR d.id::text=$1 OR r.name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%')
     ORDER BY d.last_seen_at DESC NULLS LAST,d.id LIMIT 100`,[q])).rows};
   }else{
    const match=p.slice(base.length).match(/^\/([^/]+)(?:\/(catalog|settings|category|product|audit))?$/);
    if(!match||!uuid.test(match[1]))fail('Kassen-ID nicht gefunden.',404);
    const d=(await db.query(`SELECT d.id,d.company_id,d.status,d.last_seen_at,d.app_version,o.restaurant_id,o.management_until,
     r.name,r.mode FROM online_registers o JOIN devices d ON d.id=o.device_id JOIN restaurants r ON r.id=o.restaurant_id
     JOIN users grantor ON grantor.id=o.granted_by AND grantor.company_id=d.company_id AND grantor.status='active'
      AND grantor.role IN ('owner','admin') AND NOT coalesce(grantor.must_change_password,false)
     WHERE d.id=$1 AND d.status='active' AND o.management_until>now() FOR UPDATE OF o`,[match[1]])).rows[0];
    if(!d)fail('Keine aktive Kundenfreigabe für diese Kasse.',403);
    const action=match[2]||'diagnostics';
    if(req.method==='GET'&&action==='diagnostics')result={register:{id:d.id,restaurant_id:d.restaurant_id,name:d.name,mode:d.mode,last_seen_at:d.last_seen_at,app_version:d.app_version,management_until:d.management_until},diagnostics:{database:'ok',serverTime:new Date().toISOString(),online:Boolean(d.last_seen_at&&Date.now()-Date.parse(d.last_seen_at)<120000)},capabilities:['catalog','settings','diagnostics','audit'],screenSupport:'explicit_browser_share'};
    else if(req.method==='GET'&&action==='catalog')result={categories:(await db.query('SELECT id,name,active FROM categories WHERE restaurant_id=$1 ORDER BY sort_order,name',[d.restaurant_id])).rows,products:(await db.query('SELECT id,category_id,name,description,price_cents,tax_rate,active FROM products WHERE restaurant_id=$1 ORDER BY name',[d.restaurant_id])).rows};
    else if(req.method==='GET'&&action==='audit')result={events:(await db.query("SELECT event_type,created_at,payload FROM audit_log WHERE entity_type='device' AND entity_id=$1 AND event_type LIKE 'online_register.%' ORDER BY created_at DESC LIMIT 100",[d.id])).rows};
    else if(req.method==='PUT'&&action==='settings'){
     const name=text(b.name,120,2);if(!['counter','restaurant'].includes(b.mode))fail('Ungültige Betriebsart.');
     result={restaurant:(await db.query('UPDATE restaurants SET name=$1,mode=$2 WHERE id=$3 AND company_id=$4 RETURNING id,name,mode',[name,b.mode,d.restaurant_id,d.company_id])).rows[0]};await audit(d,'settings.updated',{fields:['name','mode']});
    }else if(['POST','PUT'].includes(req.method)&&action==='category'){
     const name=text(b.name,100,1);if(!uuid.test(b.id||''))fail('Ungültige Kategorie.');
     const row=req.method==='POST'?(await db.query('INSERT INTO categories(id,restaurant_id,name) VALUES($3,$1,$2) ON CONFLICT(id) DO UPDATE SET name=categories.name WHERE categories.restaurant_id=EXCLUDED.restaurant_id AND categories.name=EXCLUDED.name RETURNING id,name,active',[d.restaurant_id,name,b.id])).rows[0]:(await db.query('UPDATE categories SET name=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING id,name,active',[name,b.id,d.restaurant_id])).rows[0];
     if(!row)fail('Kategorie nicht gefunden.',404);result={category:row};await audit(d,'category.saved',{id:row.id});status=req.method==='POST'?201:200;
    }else if(['POST','PUT'].includes(req.method)&&action==='product'){
     const name=text(b.name,160,1),description=text(b.description??'',4000);
     if(!Number.isSafeInteger(b.price_cents)||b.price_cents<0||b.price_cents>100000000||![0,7,19].includes(b.tax_rate)||typeof b.active!=='boolean')fail('Preis, Steuer oder Status ungültig.');
     if(!uuid.test(b.category_id||'')||!(await db.query('SELECT id FROM categories WHERE id=$1 AND restaurant_id=$2',[b.category_id,d.restaurant_id])).rows[0])fail('Kategorie gehört nicht zu diesem Betrieb.');
     if(!uuid.test(b.id||''))fail('Ungültiger Artikel.');
     const args=[d.restaurant_id,b.category_id,name,description,b.price_cents,b.tax_rate,b.active];
     const row=req.method==='POST'?(await db.query('INSERT INTO products(id,restaurant_id,category_id,name,description,price_cents,tax_rate,active) VALUES($8,$1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=products.name WHERE products.restaurant_id=EXCLUDED.restaurant_id AND products.category_id=EXCLUDED.category_id AND products.name=EXCLUDED.name AND products.description=EXCLUDED.description AND products.price_cents=EXCLUDED.price_cents AND products.tax_rate=EXCLUDED.tax_rate AND products.active=EXCLUDED.active RETURNING id',[...args,b.id])).rows[0]:(await db.query('UPDATE products SET category_id=$2,name=$3,description=$4,price_cents=$5,tax_rate=$6,active=$7 WHERE restaurant_id=$1 AND id=$8 RETURNING id',[...args,b.id])).rows[0];
     if(!row)fail('Artikel nicht gefunden.',404);result={product:row};await audit(d,'product.saved',{id:row.id});status=req.method==='POST'?201:200;
    }else fail('Aktion nicht unterstützt.',405);
    if(req.method==='GET')await audit(d,'read',{section:action});
   }
  }
  await db.query('COMMIT');transaction=false;return send(status,result);
 }catch(e){if(transaction)await db.query('ROLLBACK');return send(e.status||503,{error:e.status?e.message:'Kassenverwaltung momentan nicht verfügbar.'})}
 finally{db.release()}
}}

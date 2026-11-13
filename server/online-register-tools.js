import crypto from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const text=(v,max,min=0)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail('Ungültiger Text.');return v.trim()};
export function registerImage(value,{emoji=false}={}){
 if(value===null||value==='')return null;
 if(typeof value!=='string')fail('Ungültiges Bild.');
 if(emoji&&value.length<=20&&!/[<>:/]/.test(value))return value;
 const match=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
 if(!match||value.length>200000)fail('Bild: PNG, JPEG oder WebP, maximal 150 KB.');
 const bytes=Buffer.from(match[2],'base64');
 if(match[1]==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||match[1]==='jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217)||match[1]==='webp'&&!(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))fail('Bildformat stimmt nicht mit dem Inhalt überein.');
 return value;
}
export async function migrateRegisterMaintenance(db){await db.query(`CREATE TABLE IF NOT EXISTS online_register_maintenance(
 id uuid PRIMARY KEY,device_id uuid NOT NULL REFERENCES devices(id),created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 session_hash text NOT NULL,kind text NOT NULL CHECK(kind='reload'),state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','accepted','completed','declined','cancelled','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',updated_at timestamptz NOT NULL DEFAULT now(),client_version text);
 CREATE INDEX IF NOT EXISTS online_register_maintenance_device ON online_register_maintenance(device_id,created_at);`)}
const validRequest=`EXISTS(SELECT 1 FROM online_registers g JOIN devices dev ON dev.id=g.device_id
 JOIN users owner ON owner.id=g.granted_by AND owner.company_id=dev.company_id AND owner.status='active' AND owner.role IN ('owner','admin') AND NOT coalesce(owner.must_change_password,false)
 WHERE g.device_id=m.device_id AND g.management_until>now() AND dev.status='active')
 AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
 WHERE s.token_hash=m.session_hash AND s.user_id=m.created_by AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false))`;
export async function registerMaintenance(db,deviceId){
 await db.query(`UPDATE online_register_maintenance m SET state='expired',updated_at=now() WHERE device_id=$1 AND state IN ('requested','accepted') AND (expires_at<=now() OR NOT (${validRequest}))`,[deviceId]);
 return (await db.query("SELECT id,kind,state,created_at,expires_at,updated_at,client_version FROM online_register_maintenance WHERE device_id=$1 ORDER BY created_at DESC,id LIMIT 20",[deviceId])).rows;
}
export async function acknowledgeRegisterMaintenance(db,actor,b,audit){
 if(!uuid.test(b.id||'')||!/^[a-f0-9]{64}$/.test(b.deviceKey||'')||!['accepted','declined','completed'].includes(b.state))fail('Ungültige Wartungsbestätigung.');
 const d=(await db.query("SELECT d.id,d.company_id FROM devices d JOIN online_registers o ON o.device_id=d.id WHERE d.device_key=$1 AND d.company_id=$2 AND d.status='active' FOR UPDATE OF o",[b.deviceKey,actor.company_id])).rows[0];if(!d)fail('Kasse nicht freigegeben.',403);
 await registerMaintenance(db,d.id);
 const job=(await db.query('SELECT id,state,expires_at FROM online_register_maintenance WHERE id=$1 AND device_id=$2 FOR UPDATE',[b.id,d.id])).rows[0];
 if(!job)return {status:404,data:{error:'Wartungsanforderung nicht gefunden.'}};
 if(job.state===b.state)return {status:200,data:{ok:true,state:job.state}};
 if(job.expires_at<=new Date()||!(job.state==='requested'&&['accepted','declined'].includes(b.state)||job.state==='accepted'&&['completed','declined'].includes(b.state)))return {status:409,data:{error:'Wartungsanforderung abgelaufen oder bereits abgeschlossen.'}};
 const version=b.state==='completed'?text(b.clientVersion,40,1):null;
 await db.query('UPDATE online_register_maintenance SET state=$2,client_version=$3,updated_at=now() WHERE id=$1',[job.id,b.state,version]);await audit(d,'maintenance.'+b.state,{id:job.id});return {status:200,data:{ok:true,state:b.state}};
}
export async function handleRegisterTools({db,device:d,actor,raw,action,method,b,url,audit}){
 const result=(data,status=200)=>({data,status});
 if(action==='maintenance'){
  if(method==='GET')return result({requests:await registerMaintenance(db,d.id)});
  if(method!=='POST'||!uuid.test(b.id||''))fail('Ungültige Wartungsanforderung.');
  await registerMaintenance(db,d.id);
  if(b.kind==='cancel'){
   const row=(await db.query("UPDATE online_register_maintenance SET state='cancelled',updated_at=now() WHERE id=$1 AND device_id=$2 AND state='requested' RETURNING id,state",[b.id,d.id])).rows[0];if(!row)fail('Anforderung kann nicht mehr zurückgenommen werden.',409);await audit(d,'maintenance.cancelled',{id:row.id});return result(row);
  }
  if(b.kind!=='reload')fail('Nur bestätigtes Neuladen ist möglich.');
  const existing=(await db.query('SELECT id,device_id,state FROM online_register_maintenance WHERE id=$1',[b.id])).rows[0];
  if(existing){if(existing.device_id!==d.id)fail('Wartungskennung bereits vergeben.',409);return result({id:existing.id,state:existing.state})}
  if((await db.query("SELECT id FROM online_register_maintenance WHERE device_id=$1 AND state IN ('requested','accepted')",[d.id])).rows[0])fail('Für diese Kasse ist bereits eine Wartungsanforderung offen.',409);
  const row=(await db.query("INSERT INTO online_register_maintenance(id,device_id,created_by,session_hash,kind) VALUES($1,$2,$3,$4,'reload') RETURNING id,state,expires_at",[b.id,d.id,actor.id,crypto.createHash('sha256').update(raw).digest('hex')])).rows[0];await audit(d,'maintenance.requested',{id:row.id,kind:'reload'});return result(row,201);
 }
 if(action==='branding'&&method==='PUT'){
  const logo=registerImage(b.logo);await db.query('UPDATE restaurants SET logo_data=$1 WHERE id=$2 AND company_id=$3',[logo,d.restaurant_id,d.company_id]);await audit(d,'branding.saved',{hasLogo:Boolean(logo)});return result({ok:true});
 }
 if(action==='category-settings'&&method==='PUT'){
  if(!uuid.test(b.id||'')||typeof b.active!=='boolean'||!Number.isInteger(b.sort_order)||b.sort_order<0||b.sort_order>10000)fail('Kategorieeinstellungen ungültig.');
  const name=text(b.name,100,1),row=(await db.query('UPDATE categories SET name=$1,active=$2,sort_order=$3 WHERE id=$4 AND restaurant_id=$5 RETURNING id',[name,b.active,b.sort_order,b.id,d.restaurant_id])).rows[0];if(!row)fail('Kategorie nicht gefunden.',404);await audit(d,'category.settings',{id:row.id});return result({ok:true});
 }
 if(action==='health'&&method==='GET'){
  const counts=(await db.query(`SELECT (SELECT count(*)::int FROM products WHERE restaurant_id=$1) products,
   (SELECT count(*)::int FROM categories WHERE restaurant_id=$1 AND active=true) active_categories,
   (SELECT count(*)::int FROM orders WHERE restaurant_id=$1 AND status NOT IN ('paid','cancelled')) open_orders,
   (SELECT count(*)::int FROM receipts rc JOIN orders o ON o.id=rc.order_id WHERE o.restaurant_id=$1 AND rc.fiscal_status IS DISTINCT FROM 'signed') unsigned_receipts,
   (SELECT count(*)::int FROM pos_device_checks WHERE restaurant_id=$1 AND outcome='problem') reported_device_problems`,[d.restaurant_id])).rows[0];
  return result({counts,meaning:'Geräteprobleme sind gemeldete Prüfprotokolle; keine automatische Hardwareprüfung. Offene Bestellungen und unsignierte Belege sind Hinweise, keine automatische Reparatur.'});
 }
 if(!['menu-details','image','extra','translation'].includes(action))return null;
 const productId=method==='GET'?url.searchParams.get('productId'):b.productId;
 if(!uuid.test(productId||''))fail('Bitte Artikel auswählen.');
 const product=(await db.query('SELECT id,image_url FROM products WHERE id=$1 AND restaurant_id=$2',[productId,d.restaurant_id])).rows[0];if(!product)fail('Artikel nicht gefunden.',404);
 if(action==='menu-details'&&method==='GET')return result({product,extras:(await db.query('SELECT id,name,price_cents,sort_order,active FROM product_extras WHERE product_id=$1 ORDER BY sort_order,name',[productId])).rows,translations:(await db.query('SELECT language_code,description,ingredients,allergens FROM product_translations WHERE product_id=$1 ORDER BY language_code',[productId])).rows});
 if(action==='image'&&method==='PUT'){
  const image=registerImage(b.image,{emoji:true});await db.query('UPDATE products SET image_url=$1 WHERE id=$2 AND restaurant_id=$3',[image,productId,d.restaurant_id]);await audit(d,'product.image',{id:productId,hasImage:Boolean(image)});return result({ok:true});
 }
 if(action==='translation'&&method==='PUT'){
  if(!/^[a-z]{2,3}$/.test(b.language||''))fail('Sprache als ISO-Code angeben, z. B. de, en oder tr.');
  const description=text(b.description,4000),ingredients=text(b.ingredients,4000),allergens=text(b.allergens,2000);
  await db.query('INSERT INTO product_translations(product_id,language_code,description,ingredients,allergens) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,language_code) DO UPDATE SET description=EXCLUDED.description,ingredients=EXCLUDED.ingredients,allergens=EXCLUDED.allergens',[productId,b.language,description,ingredients,allergens]);await audit(d,'product.translation',{id:productId,language:b.language});return result({ok:true});
 }
 if(action==='extra'&&['PUT','POST'].includes(method)){
  if(!uuid.test(b.id||'')||typeof b.active!=='boolean'||!Number.isInteger(b.price_cents)||b.price_cents<0||b.price_cents>1000000||!Number.isInteger(b.sort_order)||b.sort_order<0||b.sort_order>10000)fail('Variante oder Aufpreis ungültig.');
  const name=text(b.name,100,1),args=[b.id,productId,name,b.price_cents,b.sort_order,b.active];
  const row=method==='POST'?(await db.query('INSERT INTO product_extras(id,product_id,name,price_cents,sort_order,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=product_extras.name WHERE product_extras.product_id=EXCLUDED.product_id AND product_extras.name=EXCLUDED.name AND product_extras.price_cents=EXCLUDED.price_cents AND product_extras.sort_order=EXCLUDED.sort_order AND product_extras.active=EXCLUDED.active RETURNING id',args)).rows[0]:(await db.query('UPDATE product_extras SET name=$3,price_cents=$4,sort_order=$5,active=$6 WHERE id=$1 AND product_id=$2 RETURNING id',args)).rows[0];if(!row)fail('Variante nicht gefunden oder Wiederholung mit anderen Daten.',409);await audit(d,'product.extra',{id:productId,extraId:row.id});return result({ok:true,id:row.id},method==='POST'?201:200);
 }
 fail('Aktion nicht unterstützt.',405);
}

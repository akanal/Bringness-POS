import crypto from 'node:crypto';
import {migrateAiBarcodes,barcodeRoutes} from './ai-barcodes.js';
import {migrateAiRecipes,recipeRoutes,apiSalesToken,ingestSale,syncPosSales} from './ai-recipes.js';
import {aiPool,platformPool,ensureAiDatabase,copyLegacyAiData} from './ai-database.js';
import {supplierRoles,units,uuid,hash,passwordHash,passwordMatches,validPassword,quantity,money,orderAmounts,mayActOnOrder} from './ai-policy.js';
const pool={query:(...args)=>aiPool().query(...args),connect:()=>aiPool().connect()};
let aiReady=false;
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
class InputError extends Error{}
const fail=message=>{throw new InputError(message)};
function text(value,max=150){const v=String(value||'').trim();if(v.length>max)fail(`Höchstens ${max} Zeichen erlaubt`);return v}
function id(value){if(!uuid.test(String(value)))fail('Ungültige ID');return value}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(req.url.split('?')[0].match(/\/barcodes\/csv(?:-preview)?$/)?220000:16000))fail('Anfrage zu groß')}try{return JSON.parse(raw||'{}')}catch{fail('Ungültige Anfrage')}}
const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
async function actor(req){return (await pool.query("SELECT u.id,u.email,u.name,u.business_name,u.role,u.status,u.city,u.postal_code,u.address,u.delivery_area,u.minimum_order_cents,u.delivery_terms,u.shop_plan FROM ai_sessions s JOIN ai_accounts u ON u.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",[hash(bearer(req))])).rows[0]}
async function platformActor(req){return (await platformPool.query("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id JOIN platform_admins a ON a.user_id=u.id AND a.active=true WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT COALESCE(u.must_change_password,false)",[hash(bearer(req))])).rows[0]}
async function settings(){return (await pool.query("SELECT value FROM ai_settings WHERE key='launch'")).rows[0].value}
export async function migrateAiPlatform(){await ensureAiDatabase();await pool.query(`
CREATE TABLE IF NOT EXISTS ai_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE NOT NULL,password_hash text NOT NULL,name text NOT NULL,business_name text NOT NULL,role text NOT NULL CHECK(role IN ('restaurant','dealer','wholesaler','manufacturer')),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended')),city text NOT NULL DEFAULT '',postal_code text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',delivery_area text NOT NULL DEFAULT '',minimum_order_cents bigint NOT NULL DEFAULT 0,delivery_terms text NOT NULL DEFAULT '',shop_plan text NOT NULL DEFAULT 'basic' CHECK(shop_plan IN ('basic','pro')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_sessions(token_hash text PRIMARY KEY,account_id uuid NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS ai_auth_tokens(token_hash text PRIMARY KEY,account_id uuid NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,kind text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE IF NOT EXISTS ai_auth_attempts(key text PRIMARY KEY,count int NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS ai_settings(key text PRIMARY KEY,value jsonb NOT NULL);
INSERT INTO ai_settings VALUES('launch','{"onboardingEnabled":true,"ordersEnabled":false,"phase":"introduction","monthlyCents":0,"commissionBps":200}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ai_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES ai_accounts(id),name text NOT NULL,address text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),name text NOT NULL,unit text NOT NULL CHECK(unit IN ('kg','l','piece')),quantity numeric(15,3) NOT NULL DEFAULT 0 CHECK(quantity>=0),minimum numeric(15,3) NOT NULL DEFAULT 0 CHECK(minimum>=0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_stock_moves(id bigserial PRIMARY KEY,stock_id uuid NOT NULL REFERENCES ai_stock(id),actor_id uuid NOT NULL REFERENCES ai_accounts(id),delta numeric(15,3) NOT NULL,reason text NOT NULL,order_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),supplier_id uuid NOT NULL REFERENCES ai_accounts(id),name text NOT NULL,unit text NOT NULL CHECK(unit IN ('kg','l','piece')),pack_quantity numeric(15,3) NOT NULL CHECK(pack_quantity>0),price_cents bigint NOT NULL CHECK(price_cents>=0),minimum_packs int NOT NULL DEFAULT 1 CHECK(minimum_packs>0),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),buyer_id uuid NOT NULL REFERENCES ai_accounts(id),supplier_id uuid NOT NULL REFERENCES ai_accounts(id),stock_id uuid NOT NULL REFERENCES ai_stock(id),product_id uuid NOT NULL REFERENCES ai_products(id),product_name text NOT NULL,unit text NOT NULL,pack_quantity numeric(15,3) NOT NULL,packs int NOT NULL,net_cents bigint NOT NULL,commission_bps int NOT NULL,commission_cents bigint NOT NULL,status text NOT NULL DEFAULT 'sent' CHECK(status IN ('sent','accepted','received','cancelled')),request_key uuid NOT NULL,delivery_date date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(buyer_id,request_key));
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS delivery_address text NOT NULL DEFAULT '';
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS buyer_email text NOT NULL DEFAULT '';
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS supplier_terms text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS ai_audit(id bigserial PRIMARY KEY,actor_id uuid NOT NULL,target_id uuid,action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ai_stock_account_idx ON ai_stock(account_id);
CREATE INDEX IF NOT EXISTS ai_orders_buyer_idx ON ai_orders(buyer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_orders_supplier_idx ON ai_orders(supplier_id,created_at DESC);
`);await copyLegacyAiData();await migrateAiRecipes();await migrateAiBarcodes();aiReady=true;console.log("Bringness AI separate database ready.")}
async function rate(key,max=8){const r=await pool.query("INSERT INTO ai_auth_attempts(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ai_auth_attempts.expires_at<now() THEN 1 ELSE ai_auth_attempts.count+1 END,expires_at=CASE WHEN ai_auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE ai_auth_attempts.expires_at END RETURNING count",[hash(key)]);return r.rows[0].count<=max}
async function email(to,name,token,kind){
 if(![process.env.SMTP_HOST,process.env.SMTP_USER,process.env.SMTP_PASSWORD,process.env.SMTP_FROM].every(Boolean))throw Error('SMTP fehlt');
 const origin=(process.env.AI_PUBLIC_BASE_URL||process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');if(!origin.startsWith('https://'))throw Error('HTTPS-Adresse fehlt');
 const {default:nodemailer}=await import('nodemailer');const port=Number(process.env.SMTP_PORT||587);
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},tls:{rejectUnauthorized:true},connectionTimeout:10000,socketTimeout:15000});
 const address=process.env.SMTP_FROM.match(/<([^>]+)>/)?.[1]||process.env.SMTP_FROM;
 const verify=kind==='verify',label=verify?'E-Mail bestätigen':'Neues Passwort festlegen';
 const link=`${origin}/ai-workspace.html#${kind}=${token}`;
 const escapeHtml=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=`<!doctype html><html lang="de"><body style="margin:0;background:#f4f2e9;font-family:Arial,sans-serif;color:#183d35"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fffdf6;border-radius:16px"><tr><td style="padding:32px"><p style="font-size:22px;font-weight:bold;margin:0 0 28px">Bringness AI</p><h1 style="font-size:26px;margin:0 0 16px">${verify?'Ein Klick genügt.':'Dein neues Passwort.'}</h1><p style="line-height:1.6;margin:0 0 26px">${verify?'Bestätige deine E-Mail-Adresse und starte mit Bringness AI.':'Öffne den Button und lege dein neues Passwort fest.'}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#183d35" style="border-radius:28px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 26px;border:1px solid #183d35;border-radius:28px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold">${label}</a></td></tr></table><p style="font-size:12px;line-height:1.6;color:#536a61;margin:24px 0 0">${verify?'Der Button ist 48 Stunden gültig.':'Der Button ist eine Stunde gültig.'}<br>Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p></td></tr></table></td></tr></table></body></html>`;
 await transport.sendMail({from:{name:'Bringness AI',address},to,subject:verify?'Bringness AI – E-Mail bestätigen':'Bringness AI – Passwort zurücksetzen',html,text:`${label}:\n${link}\n\n${verify?'Gültig für 48 Stunden.':'Gültig für eine Stunde.'} Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.`});
}
export async function handleAiPlatform(req,res){
 const url=new URL(req.url,'http://local'),p=url.pathname;if(!p.startsWith('/api/ai/'))return false;
 if(!aiReady)return send(res,503,{error:'Bringness AI wird vorbereitet. Bitte gleich erneut versuchen.'});
 try{
  if(p==='/api/ai/import/sales'&&req.method==='POST'){const link=await apiSalesToken(bearer(req));if(!link)return send(res,401,{error:'Ungültiger oder pausierter API-Schlüssel'});return send(res,200,await ingestSale(link,await body(req)))}
  if(p==='/api/ai/public'&&req.method==='GET')return send(res,200,{launch:await settings()});
  if(p==='/api/ai/register'&&req.method==='POST'){
   if(!await rate('signup-ip:'+req.socket.remoteAddress,30))return send(res,429,{error:'Bitte später erneut versuchen.'});
   const b=await body(req),emailAddress=text(b.email,254).toLowerCase(),name=text(b.name,100),business=text(b.businessName),role=b.role;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)||!name||!business||![...supplierRoles,'restaurant'].includes(role)||!validPassword(b.password))fail('Name, Firma, gültige E-Mail und Passwort mit 10 bis 128 Zeichen erforderlich');
   if(b.acceptTerms!==true)fail('Bitte die Einführungskonditionen bestätigen');
   if(!(await settings()).onboardingEnabled)return send(res,409,{error:'Neue Registrierungen sind vorübergehend pausiert.'});
   if(!await rate('register:'+emailAddress,3))return send(res,429,{error:'Bitte später erneut versuchen.'});
   const existing=await pool.query('SELECT id FROM ai_accounts WHERE email=$1',[emailAddress]);if(existing.rowCount)return send(res,200,{message:'Wenn die Anmeldung möglich ist, erhältst du eine Bestätigung. Bei bestehendem Konto nutze Anmeldung oder Passwort vergessen.'});
   const c=await pool.connect();try{await c.query('BEGIN');const u=(await c.query('INSERT INTO ai_accounts(email,password_hash,name,business_name,role) VALUES($1,$2,$3,$4,$5) RETURNING id',[emailAddress,passwordHash(b.password),name,business,role])).rows[0];const token=crypto.randomBytes(32).toString('hex');await c.query("INSERT INTO ai_auth_tokens VALUES($1,$2,'verify',now()+interval '48 hours',NULL)",[hash(token),u.id]);await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$1,'introduction_agreed',$2)",[u.id,JSON.stringify({monthlyCents:0,commissionBps:supplierRoles.includes(role)?200:0,version:1})]);await email(emailAddress,name,token,'verify');await c.query('COMMIT');return send(res,201,{message:'Bestätigung versendet. Bitte prüfe auch deinen Spamordner.'})}catch(e){await c.query('ROLLBACK');console.error('AI registration failed:',e.code||e.name);return send(res,503,{error:'Bestätigung konnte nicht versendet werden. Bitte später erneut registrieren.'})}finally{c.release()}
  }
  if(p==='/api/ai/resend'&&req.method==='POST'){
   const b=await body(req),address=text(b.email,254).toLowerCase();if(!await rate('resend:'+address,3))return send(res,429,{error:'Bitte später erneut versuchen.'});
   const u=(await pool.query("SELECT id,name FROM ai_accounts WHERE email=$1 AND status='pending'",[address])).rows[0];if(u){const token=crypto.randomBytes(32).toString('hex');try{await pool.query("INSERT INTO ai_auth_tokens VALUES($1,$2,'verify',now()+interval '48 hours',NULL)",[hash(token),u.id]);await email(address,u.name,token,'verify')}catch(e){console.error('AI resend failed:',e.code||e.name)}}return send(res,200,{message:'Wenn eine Bestätigung aussteht, erhältst du einen neuen Link.'});
  }
  if(p==='/api/ai/verify'&&req.method==='POST'){
   const b=await body(req);if(!/^[a-f0-9]{64}$/.test(String(b.token)))fail('Ungültiger Link');
   const r=await pool.query("WITH t AS (UPDATE ai_auth_tokens SET used_at=now() WHERE token_hash=$1 AND kind='verify' AND used_at IS NULL AND expires_at>now() RETURNING account_id) UPDATE ai_accounts SET status='active' WHERE id=(SELECT account_id FROM t) AND status='pending' RETURNING id",[hash(b.token)]);return send(res,r.rowCount?200:400,r.rowCount?{message:'E-Mail bestätigt. Du kannst dich anmelden.'}:{error:'Link ungültig oder abgelaufen.'});
  }
  if(p==='/api/ai/login'&&req.method==='POST'){
   const b=await body(req),emailAddress=text(b.email,254).toLowerCase();if(!validPassword(b.password))fail('E-Mail und Passwort erforderlich');if(!await rate('login:'+emailAddress))return send(res,429,{error:'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.'});
   const u=(await pool.query('SELECT * FROM ai_accounts WHERE email=$1',[emailAddress])).rows[0];
   const stored=u?.password_hash||'00000000000000000000000000000000:'+ '0'.repeat(128);
   if(!passwordMatches(b.password,stored)||u?.status!=='active')return send(res,401,{error:'Anmeldung nicht möglich. Prüfe deine Zugangsdaten und E-Mail-Bestätigung.'});
   const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO ai_sessions VALUES($1,$2,now()+interval '12 hours')",[hash(token),u.id]);await pool.query('DELETE FROM ai_auth_attempts WHERE key=$1',[hash('login:'+emailAddress)]);return send(res,200,{token});
  }
  if(p==='/api/ai/forgot'&&req.method==='POST'){
   const b=await body(req),emailAddress=text(b.email,254).toLowerCase();if(!await rate('reset:'+emailAddress,3))return send(res,429,{error:'Bitte später erneut versuchen.'});
   const u=(await pool.query("SELECT id,name FROM ai_accounts WHERE email=$1 AND status IN ('active','pending')",[emailAddress])).rows[0];
   if(u){const token=crypto.randomBytes(32).toString('hex');try{await pool.query("INSERT INTO ai_auth_tokens VALUES($1,$2,'reset',now()+interval '1 hour',NULL)",[hash(token),u.id]);await email(emailAddress,u.name,token,'reset')}catch(e){console.error('AI reset mail failed:',e.code||e.name)}}return send(res,200,{message:'Wenn ein Konto besteht, erhältst du eine E-Mail zum Zurücksetzen.'});
  }
  if(p==='/api/ai/reset'&&req.method==='POST'){
   const b=await body(req);if(!validPassword(b.password)||!/^[a-f0-9]{64}$/.test(String(b.token)))fail('Neues Passwort mit 10 bis 128 Zeichen erforderlich');
   const c=await pool.connect();try{await c.query('BEGIN');const t=(await c.query("SELECT account_id FROM ai_auth_tokens WHERE token_hash=$1 AND kind='reset' AND used_at IS NULL AND expires_at>now() FOR UPDATE",[hash(b.token)])).rows[0];if(!t){await c.query('ROLLBACK');return send(res,400,{error:'Link ungültig oder abgelaufen.'})}await c.query('UPDATE ai_accounts SET password_hash=$2 WHERE id=$1',[t.account_id,passwordHash(b.password)]);await c.query("UPDATE ai_auth_tokens SET used_at=now() WHERE account_id=$1 AND kind='reset'",[t.account_id]);await c.query('DELETE FROM ai_sessions WHERE account_id=$1',[t.account_id]);await c.query('COMMIT');return send(res,200,{message:'Passwort geändert. Bitte neu anmelden.'})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  if(p.startsWith('/api/ai/admin')){
   const admin=await platformActor(req);if(!admin)return send(res,403,{error:'Nur Plattformadministratoren haben Zugriff.'});
   if(p.startsWith('/api/ai/admin/barcodes'))return send(res,200,await barcodeRoutes(p,req.method,req.method==='POST'?await body(req):{},admin,true,url));
   if(p==='/api/ai/admin'&&req.method==='GET'){
    const q=text(url.searchParams.get('q')),users=(await pool.query("SELECT id,email,name,business_name,role,status,shop_plan,city,created_at FROM ai_accounts WHERE $1='' OR email ILIKE '%'||$1||'%' OR name ILIKE '%'||$1||'%' OR business_name ILIKE '%'||$1||'%' ORDER BY created_at DESC LIMIT 200",[q])).rows;
    const totals=(await pool.query("SELECT status,count(*)::int count,COALESCE(sum(net_cents),0)::text net_cents,COALESCE(sum(commission_cents),0)::text commission_cents FROM ai_orders GROUP BY status")).rows;
    const audit=(await pool.query('SELECT * FROM ai_audit ORDER BY id DESC LIMIT 50')).rows;return send(res,200,{users,totals,audit,launch:await settings()});
   }
   if(p==='/api/ai/admin/account'&&req.method==='POST'){
    const b=await body(req);id(b.id);if(!['suspend','restore'].includes(b.action))fail('Ungültige Aktion');
    const c=await pool.connect();try{await c.query('BEGIN');const changed=await c.query("UPDATE ai_accounts SET status=$2 WHERE id=$1 AND status=$3 RETURNING id",[b.id,b.action==='suspend'?'suspended':'active',b.action==='suspend'?'active':'suspended']);if(!changed.rowCount){await c.query('ROLLBACK');return send(res,409,{error:'Statuswechsel nicht möglich. Unbestätigte Konten können nicht aktiviert werden.'})}await c.query('DELETE FROM ai_sessions WHERE account_id=$1',[b.id]);await c.query('INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,$3)',[admin.id,b.id,b.action]);await c.query('COMMIT');return send(res,200,{ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
   }
   if(p==='/api/ai/admin/launch'&&req.method==='POST'){
    const b=await body(req);if(typeof b.onboardingEnabled!=='boolean'||typeof b.ordersEnabled!=='boolean')fail('Schalter erforderlich');
    const c=await pool.connect();try{await c.query('BEGIN');await c.query("UPDATE ai_settings SET value=jsonb_set(jsonb_set(value,'{onboardingEnabled}',$1::jsonb),'{ordersEnabled}',$2::jsonb) WHERE key='launch'",[JSON.stringify(b.onboardingEnabled),JSON.stringify(b.ordersEnabled)]);await c.query("INSERT INTO ai_audit(actor_id,action,detail) VALUES($1,'launch_controls',$2)",[admin.id,JSON.stringify(b)]);await c.query('COMMIT');return send(res,200,{ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
   }
   return send(res,404,{error:'Adminfunktion nicht gefunden'});
  }
  const u=await actor(req);if(!u)return send(res,401,{error:'Bitte anmelden.'});
  if(p.startsWith('/api/ai/barcodes')){if(req.method==='POST'&&!await rate('barcodes:'+u.id,300))return send(res,429,{error:'Zu viele Kataloganfragen. Bitte später erneut versuchen.'});return send(res,200,await barcodeRoutes(p,req.method,req.method==='POST'?await body(req):{},u,false,url));}
  const recipeResult=await recipeRoutes(p,req.method,req.method==='POST'&&['/api/ai/recipes','/api/ai/connectors','/api/ai/pos-link','/api/ai/connector-status'].includes(p)?await body(req):{},u);if(recipeResult)return send(res,200,recipeResult);
  if(p==='/api/ai/logout'&&req.method==='POST'){await pool.query('DELETE FROM ai_sessions WHERE token_hash=$1',[hash(bearer(req))]);return send(res,200,{ok:true})}
  if(p==='/api/ai/me'&&req.method==='GET')return send(res,200,{account:u,launch:await settings()});
  if(p==='/api/ai/profile'&&req.method==='POST'){
   const b=await body(req),name=text(b.name,100),business=text(b.businessName);if(!name||!business)fail('Name und Firmenname erforderlich');
   const minimum=money(b.minimumOrderCents||0);if(!['basic','pro'].includes(b.shopPlan||'basic'))fail('Ungültiger Shop');
   await pool.query('UPDATE ai_accounts SET name=$2,business_name=$3,city=$4,postal_code=$5,address=$6,delivery_area=$7,minimum_order_cents=$8,delivery_terms=$9,shop_plan=$10 WHERE id=$1',[u.id,name,business,text(b.city,100),text(b.postalCode,20),text(b.address,300),text(b.deliveryArea,1000),minimum,text(b.deliveryTerms,1000),b.shopPlan||'basic']);return send(res,200,{ok:true});
  }
  if(p==='/api/ai/locations'){
   if(u.role!=='restaurant')return send(res,403,{error:'Nur Restaurants können Standorte verwalten.'});
   if(req.method==='GET')return send(res,200,{locations:(await pool.query('SELECT * FROM ai_locations WHERE account_id=$1 ORDER BY name',[u.id])).rows});
   if(req.method==='POST'){const b=await body(req),name=text(b.name);if(!name)fail('Standortname erforderlich');const r=await pool.query('INSERT INTO ai_locations(account_id,name,address) VALUES($1,$2,$3) RETURNING *',[u.id,name,text(b.address,300)]);return send(res,201,{location:r.rows[0]})}
  }
  if(p==='/api/ai/stock'){
   if(u.role!=='restaurant')return send(res,403,{error:'Nur Restaurants können Lager verwalten.'});
   if(req.method==='GET')return send(res,200,{stock:(await pool.query('SELECT s.*,l.name location_name FROM ai_stock s JOIN ai_locations l ON l.id=s.location_id WHERE s.account_id=$1 ORDER BY l.name,s.name LIMIT 1000',[u.id])).rows});
   if(req.method==='POST'){
    const b=await body(req),name=text(b.name);id(b.locationId);if(!name||!units.includes(b.unit))fail('Zutat und Einheit erforderlich');const qty=quantity(b.quantity),minimum=quantity(b.minimum);
    const c=await pool.connect();try{await c.query('BEGIN');if(!(await c.query('SELECT id FROM ai_locations WHERE id=$1 AND account_id=$2',[b.locationId,u.id])).rowCount){await c.query('ROLLBACK');return send(res,404,{error:'Standort nicht gefunden'})}const s=(await c.query('INSERT INTO ai_stock(account_id,location_id,name,unit,quantity,minimum) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[u.id,b.locationId,name,b.unit,qty,minimum])).rows[0];await c.query("INSERT INTO ai_stock_moves(stock_id,actor_id,delta,reason) VALUES($1,$2,$3,'Anfangsbestand')",[s.id,u.id,qty]);await c.query('COMMIT');return send(res,201,{stock:s})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
   }
  }
  if(p==='/api/ai/stock-adjust'&&req.method==='POST'){
   if(u.role!=='restaurant')return send(res,403,{error:'Keine Berechtigung'});const b=await body(req);id(b.id);const qty=quantity(b.quantity),minimum=quantity(b.minimum),reason=text(b.reason,500);if(!reason)fail('Grund der Bestandskorrektur erforderlich');
   const c=await pool.connect();try{await c.query('BEGIN');const s=(await c.query('SELECT * FROM ai_stock WHERE id=$1 AND account_id=$2 FOR UPDATE',[b.id,u.id])).rows[0];if(!s){await c.query('ROLLBACK');return send(res,404,{error:'Zutat nicht gefunden'})}await c.query('UPDATE ai_stock SET quantity=$2,minimum=$3 WHERE id=$1',[s.id,qty,minimum]);await c.query('INSERT INTO ai_stock_moves(stock_id,actor_id,delta,reason) VALUES($1,$2,$3,$4)',[s.id,u.id,qty-Number(s.quantity),reason]);await c.query('COMMIT');return send(res,200,{ok:true})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  if(p==='/api/ai/stock-moves'&&req.method==='GET')return send(res,200,{moves:(await pool.query('SELECT m.*,s.name FROM ai_stock_moves m JOIN ai_stock s ON s.id=m.stock_id WHERE s.account_id=$1 ORDER BY m.id DESC LIMIT 100',[u.id])).rows});
  if(p==='/api/ai/products'){
   if(!supplierRoles.includes(u.role))return send(res,403,{error:'Nur Lieferanten können Produkte verwalten.'});
   if(req.method==='GET')return send(res,200,{products:(await pool.query('SELECT * FROM ai_products WHERE supplier_id=$1 ORDER BY name LIMIT 1000',[u.id])).rows});
   if(req.method==='POST'){
    const b=await body(req),name=text(b.name),packQty=quantity(b.packQuantity),price=money(b.priceCents);if(!name||!units.includes(b.unit)||packQty<=0||!Number.isInteger(b.minimumPacks)||b.minimumPacks<1||b.minimumPacks>10000)fail('Produkt, Einheit, Packungsmenge, Nettopreis und Mindestmenge erforderlich');
    if(b.id){id(b.id);const r=await pool.query('UPDATE ai_products SET name=$3,unit=$4,pack_quantity=$5,price_cents=$6,minimum_packs=$7,active=$8 WHERE id=$1 AND supplier_id=$2 RETURNING id',[b.id,u.id,name,b.unit,packQty,price,b.minimumPacks,b.active!==false]);if(!r.rowCount)return send(res,404,{error:'Produkt nicht gefunden'});return send(res,200,{ok:true})}
    await pool.query('INSERT INTO ai_products(supplier_id,name,unit,pack_quantity,price_cents,minimum_packs) VALUES($1,$2,$3,$4,$5,$6)',[u.id,name,b.unit,packQty,price,b.minimumPacks]);return send(res,201,{ok:true});
   }
  }
  if(p==='/api/ai/catalog'&&req.method==='GET'){
   const q=text(url.searchParams.get('q')),unit=url.searchParams.get('unit')||'',supplier=url.searchParams.get('supplier')||'';if(unit&&!units.includes(unit))fail('Ungültige Einheit');if(supplier)id(supplier);
   const products=(await pool.query("SELECT p.*,u.business_name,u.city,u.delivery_area,u.minimum_order_cents,u.delivery_terms FROM ai_products p JOIN ai_accounts u ON u.id=p.supplier_id WHERE p.active AND u.status='active' AND ($1='' OR p.name ILIKE '%'||$1||'%' OR u.business_name ILIKE '%'||$1||'%' OR u.delivery_area ILIKE '%'||$1||'%') AND ($2='' OR p.unit=$2) AND ($3::text IS NULL OR p.supplier_id=$3::text::uuid) ORDER BY p.name LIMIT 200",[q,unit,supplier||null])).rows;
   return send(res,200,{products});
  }
  if(p==='/api/ai/orders'&&req.method==='GET')return send(res,200,{orders:(await pool.query('SELECT o.*,b.business_name buyer_name,s.business_name supplier_name,l.name location_name FROM ai_orders o JOIN ai_accounts b ON b.id=o.buyer_id JOIN ai_accounts s ON s.id=o.supplier_id JOIN ai_stock st ON st.id=o.stock_id JOIN ai_locations l ON l.id=st.location_id WHERE o.buyer_id=$1 OR o.supplier_id=$1 ORDER BY o.created_at DESC LIMIT 200',[u.id])).rows});
  if(p==='/api/ai/orders'&&req.method==='POST'){
   if(u.role!=='restaurant')return send(res,403,{error:'Nur Restaurants können bestellen.'});const b=await body(req);id(b.productId);id(b.stockId);id(b.requestKey);if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.deliveryDate))||!Number.isFinite(Date.parse(b.deliveryDate))||new Date(b.deliveryDate).toISOString().slice(0,10)!==b.deliveryDate)fail('Gültiges Lieferdatum erforderlich');if(!b.confirmed)fail('Bestellung muss bestätigt werden');
   const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM ai_accounts WHERE id=$1 FOR UPDATE',[u.id]);const old=(await c.query('SELECT * FROM ai_orders WHERE buyer_id=$1 AND request_key=$2',[u.id,b.requestKey])).rows[0];if(old){await c.query('COMMIT');return send(res,200,{order:old})}
    const launch=(await c.query("SELECT value FROM ai_settings WHERE key='launch'")).rows[0].value;if(!launch.ordersEnabled){await c.query('ROLLBACK');return send(res,409,{error:'Bestellungen sind noch nicht freigeschaltet. Sortimente und Lager können bereits eingerichtet werden.'})}
    const stock=(await c.query('SELECT st.*,l.address location_address,l.name location_name FROM ai_stock st JOIN ai_locations l ON l.id=st.location_id WHERE st.id=$1 AND st.account_id=$2',[b.stockId,u.id])).rows[0];const product=(await c.query("SELECT p.*,s.minimum_order_cents,s.city,s.address,s.delivery_area,s.delivery_terms FROM ai_products p JOIN ai_accounts s ON s.id=p.supplier_id WHERE p.id=$1 AND p.active AND s.status='active' FOR SHARE OF p,s",[b.productId])).rows[0];if(!stock||!product){await c.query('ROLLBACK');return send(res,404,{error:'Zutat oder Angebot nicht gefunden'})}if(stock.unit!==product.unit)fail('Einheiten von Zutat und Angebot müssen übereinstimmen');if(b.packs<product.minimum_packs)fail('Mindestmenge des Produkts beachten');const amounts=orderAmounts(Number(product.price_cents),b.packs,200);if(amounts.netCents<Number(product.minimum_order_cents))fail('Mindestbestellwert des Lieferanten beachten');if(!u.address||!u.city||!product.address||!product.city)fail('Restaurant und Lieferant müssen zuerst ihre Geschäftsanschrift hinterlegen');if(b.expectedNetCents!==amounts.netCents)fail('Preis wurde geändert. Bitte das Angebot neu laden');
    const order=(await c.query('INSERT INTO ai_orders(buyer_id,supplier_id,stock_id,product_id,product_name,unit,pack_quantity,packs,net_cents,commission_bps,commission_cents,request_key,delivery_date,delivery_address,buyer_email,supplier_terms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,200,$10,$11,$12,$13,$14,$15) RETURNING *',[u.id,product.supplier_id,stock.id,product.id,product.name,product.unit,product.pack_quantity,b.packs,amounts.netCents,amounts.commissionCents,b.requestKey,b.deliveryDate,[u.business_name,stock.location_name,stock.location_address||[u.address,u.postal_code,u.city].filter(Boolean).join(', ')].filter(Boolean).join(', '),u.email,[product.delivery_area,product.delivery_terms].filter(Boolean).join(' · ')])).rows[0];await c.query('COMMIT');return send(res,201,{order});
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  const match=p.match(/^\/api\/ai\/orders\/([0-9a-f-]+)\/(accept|receive|cancel)$/i);
  if(match&&req.method==='POST'){
   id(match[1]);const c=await pool.connect();try{await c.query('BEGIN');const o=(await c.query('SELECT * FROM ai_orders WHERE id=$1 FOR UPDATE',[match[1]])).rows[0];if(!o||![o.buyer_id,o.supplier_id].includes(u.id)){await c.query('ROLLBACK');return send(res,404,{error:'Bestellung nicht gefunden'})}
    if(match[2]==='receive'&&u.id===o.buyer_id&&o.status==='received'){await c.query('COMMIT');return send(res,200,{ok:true})}
    if(!mayActOnOrder(u,o,match[2])){await c.query('ROLLBACK');return send(res,409,{error:'Aktion für diesen Status nicht möglich'})}
    const status={accept:'accepted',receive:'received',cancel:'cancelled'}[match[2]];
    if(status==='received'){const delta=Number(o.pack_quantity)*o.packs;await c.query('UPDATE ai_stock SET quantity=quantity+$2 WHERE id=$1',[o.stock_id,delta]);await c.query("INSERT INTO ai_stock_moves(stock_id,actor_id,delta,reason,order_id) VALUES($1,$2,$3,'Wareneingang',$4)",[o.stock_id,u.id,delta,o.id])}
    await c.query("UPDATE ai_orders SET status=$2,updated_at=now(),commission_cents=CASE WHEN $2='cancelled' THEN 0 ELSE commission_cents END WHERE id=$1",[o.id,status]);await c.query('INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,$3)',[u.id,o.id,'order_'+status]);await c.query('COMMIT');return send(res,200,{ok:true});
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  return send(res,404,{error:'AI-Funktion nicht gefunden'});
 }catch(e){if(e.status)return send(res,e.status,{error:e.message});if(e instanceof InputError||/Menge|Nettopreis|Packungen|Bestellwert/.test(e.message))return send(res,400,{error:e.message});console.error('AI API error:',e.code||e.name);return send(res,500,{error:'Aktion fehlgeschlagen. Bitte erneut versuchen.'})}
}

setInterval(()=>{if(aiReady)syncPosSales()},15000).unref();

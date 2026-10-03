import crypto from 'node:crypto';
import {aiPool} from './ai-database.js';
import {uuid,supplierRoles} from './ai-policy.js';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const text=(v,max,required=false)=>{if(typeof v!=='string'||v.trim().length>max||required&&!v.trim())fail('Ungültiger Werbetext');return v.trim()};
const checkId=id=>{if(!uuid.test(String(id)))fail('Ungültige ID');return id};
const list=(v,postal=false)=>{if(!Array.isArray(v)||v.length>100)fail('Höchstens 100 Zielangaben');return [...new Set(v.map(x=>{const n=text(x,80,true).toLocaleLowerCase('de-DE');if(postal&&!/^\d{2,5}$/.test(n))fail('PLZ-Präfix muss 2 bis 5 Ziffern enthalten');return n}))]};
const snapshotSql="jsonb_build_object('name',p.name,'unit',p.unit,'packQuantity',p.pack_quantity::text,'priceCents',p.price_cents::text,'minimumPacks',p.minimum_packs)";
export async function migrateAiAds(){await aiPool().query(`
ALTER TABLE ai_accounts ADD COLUMN IF NOT EXISTS cuisine_type text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS ai_ads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),supplier_id uuid NOT NULL REFERENCES ai_accounts(id),product_id uuid REFERENCES ai_products(id),kind text NOT NULL CHECK(kind IN ('product','offer','seasonal','brand')),title text NOT NULL,description text NOT NULL,image_data text NOT NULL DEFAULT '',product_snapshot jsonb,status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','quoted','accepted','active','paused','rejected')),version int NOT NULL DEFAULT 1,fee_cents bigint,starts_at timestamptz,ends_at timestamptz,cities jsonb NOT NULL DEFAULT '[]',postal_prefixes jsonb NOT NULL DEFAULT '[]',cuisines jsonb NOT NULL DEFAULT '[]',placement text,category text NOT NULL DEFAULT '',admin_note text NOT NULL DEFAULT '',accepted_at timestamptz,approved_by uuid,approved_at timestamptz,payment_reference text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_ad_events(token text PRIMARY KEY,ad_id uuid NOT NULL REFERENCES ai_ads(id),account_id uuid NOT NULL REFERENCES ai_accounts(id),version int NOT NULL,bucket timestamptz NOT NULL,viewed_at timestamptz,clicked_at timestamptz,UNIQUE(ad_id,account_id,version,bucket));
CREATE INDEX IF NOT EXISTS ai_ads_supplier ON ai_ads(supplier_id,created_at DESC);
`)}
async function adList(u,admin){return {ads:(await aiPool().query(`SELECT a.*,s.business_name supplier_name,s.delivery_area,
 (SELECT count(*)::int FROM ai_ad_events e WHERE e.ad_id=a.id AND e.viewed_at IS NOT NULL) impressions,
 (SELECT count(*)::int FROM ai_ad_events e WHERE e.ad_id=a.id AND e.clicked_at IS NOT NULL) clicks,
 (a.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ai_products p WHERE p.id=a.product_id AND p.active AND p.available AND ${snapshotSql}=a.product_snapshot)) product_changed
 FROM ai_ads a JOIN ai_accounts s ON s.id=a.supplier_id WHERE ($2::boolean OR a.supplier_id=$1) ORDER BY a.updated_at DESC LIMIT 500`,[u.id,admin])).rows}}
function eligible(a,u,placement,context=''){
 if(a.placement!==placement)return false;
 const city=String(u.city||'').trim().toLocaleLowerCase('de-DE'),postal=String(u.postal_code||'').trim();
 if(!a.cities.includes(city)&&!a.postal_prefixes.some(p=>postal.startsWith(p)))return false;
 if(a.cuisines.length&&!a.cuisines.includes(String(u.cuisine_type||'').trim().toLocaleLowerCase('de-DE')))return false;
 if(a.category&&context&&!context.toLocaleLowerCase('de-DE').includes(a.category))return false;
 return true;
}
async function live(u,placement,context=''){
 if(u.role!=='restaurant')fail('Werbung wird nur Restaurantkonten angezeigt',403);
 if(!['dashboard','catalog','purchasing'].includes(placement))fail('Ungültige Platzierung');
 const rows=(await aiPool().query(`SELECT a.id,a.version,a.title,a.description,a.image_data,a.product_id,a.supplier_id,a.placement,a.cities,a.postal_prefixes,a.cuisines,a.category,s.business_name,
 p.price_cents,p.pack_quantity,p.unit FROM ai_ads a JOIN ai_accounts s ON s.id=a.supplier_id LEFT JOIN ai_products p ON p.id=a.product_id WHERE a.status='active' AND a.approved_by IS NOT NULL AND a.accepted_at IS NOT NULL AND s.status='active' AND now()>=a.starts_at AND now()<a.ends_at AND (a.product_id IS NULL OR (p.active AND p.available AND ${snapshotSql}=a.product_snapshot)) ORDER BY a.approved_at DESC,a.id LIMIT 1000`)).rows;
 const ads=[];
 for(const a of rows.filter(a=>eligible(a,u,placement,context)).slice(0,3)){
  const token=crypto.randomBytes(32).toString('hex');
  const e=(await aiPool().query("INSERT INTO ai_ad_events(token,ad_id,account_id,version,bucket) VALUES($1,$2,$3,$4,date_trunc('hour',now())) ON CONFLICT(ad_id,account_id,version,bucket) DO UPDATE SET token=ai_ad_events.token RETURNING token",[token,a.id,u.id,a.version])).rows[0];
  const {cities,postal_prefixes,cuisines,category,version,...publicAd}=a;ads.push({...publicAd,label:'Anzeige',eventToken:e.token});
 }
 return {ads};
}
export async function adRoutes(p,method,b,u,url,admin=false){
 const base=admin?'/api/ai/admin/ads':'/api/ai/ads';
 if(p===base+'/live'&&!admin&&method==='GET')return live(u,url.searchParams.get('placement'),String(url.searchParams.get('q')||'').slice(0,500));
 if(p===base+'/event'&&!admin&&method==='POST'){
  if(u.role!=='restaurant'||!['view','click'].includes(b.kind)||!/^[a-f0-9]{64}$/.test(String(b.token)))fail('Ungültiges Anzeigenereignis');
  const q=await aiPool().query(`UPDATE ai_ad_events e SET viewed_at=coalesce(viewed_at,now()),clicked_at=CASE WHEN $3='click' THEN coalesce(clicked_at,now()) ELSE clicked_at END FROM ai_ads a JOIN ai_accounts s ON s.id=a.supplier_id LEFT JOIN ai_products p ON p.id=a.product_id WHERE e.token=$1 AND e.account_id=$2 AND e.ad_id=a.id AND e.version=a.version AND a.status='active' AND s.status='active' AND a.approved_by IS NOT NULL AND a.accepted_at IS NOT NULL AND now()>=a.starts_at AND now()<a.ends_at AND (a.product_id IS NULL OR(p.active AND p.available AND ${snapshotSql}=a.product_snapshot)) RETURNING e.ad_id`,[b.token,u.id,b.kind]);
  if(!q.rowCount)fail('Anzeige nicht mehr aktiv',409);return {ok:true};
 }
 if(p!==base&&!p.startsWith(base+'/'))return null;
 if(!admin&&!supplierRoles.includes(u.role))fail('Nur Lieferanten dürfen Werbung einreichen',403);
 if(p===base&&method==='GET')return adList(u,admin);
 if(p===base&&method==='POST'&&!admin){
  const title=text(b.title,100,true),description=text(b.description,1000,true),image=text(b.imageData||'',180000);
  if(!['product','offer','seasonal','brand'].includes(b.kind))fail('Werbeart erforderlich');
  if(image&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image))fail('Nur PNG, JPEG oder WebP erlauben');
  if(b.productId)checkId(b.productId);if(['product','offer'].includes(b.kind)&&!b.productId)fail('Eigenes Produkt auswählen');
  const c=await aiPool().connect();try{await c.query('BEGIN');let snapshot=null;
   if(b.productId){const product=(await c.query(`SELECT ${snapshotSql} snapshot FROM ai_products p WHERE p.id=$1 AND p.supplier_id=$2 AND p.active AND p.available FOR SHARE`,[b.productId,u.id])).rows[0];if(!product)fail('Eigenes lieferbares Produkt erforderlich');snapshot=product.snapshot}
   let id;
   if(b.id){checkId(b.id);const q=await c.query("UPDATE ai_ads SET product_id=$3,kind=$4,title=$5,description=$6,image_data=$7,product_snapshot=$8,status='submitted',version=version+1,fee_cents=NULL,starts_at=NULL,ends_at=NULL,cities='[]',postal_prefixes='[]',cuisines='[]',placement=NULL,accepted_at=NULL,approved_by=NULL,approved_at=NULL,payment_reference='',updated_at=now() WHERE id=$1 AND supplier_id=$2 RETURNING id",[b.id,u.id,b.productId||null,b.kind,title,description,image,JSON.stringify(snapshot)]);if(!q.rowCount)fail('Kampagne nicht gefunden',404);id=q.rows[0].id}
   else id=(await c.query('INSERT INTO ai_ads(supplier_id,product_id,kind,title,description,image_data,product_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[u.id,b.productId||null,b.kind,title,description,image,JSON.stringify(snapshot)])).rows[0].id;
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'ad_submitted')",[u.id,id]);await c.query('COMMIT');return {id,message:'Zur Superadmin-Prüfung eingereicht.'};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 const action=p.slice(base.length+1);
 if(method!=='POST')fail('Methode nicht erlaubt',405);
 checkId(b.id);const c=await aiPool().connect();try{await c.query('BEGIN');const a=(await c.query('SELECT * FROM ai_ads WHERE id=$1 FOR UPDATE',[b.id])).rows[0];if(!a||!admin&&a.supplier_id!==u.id)fail('Kampagne nicht gefunden',404);
  if(!admin){
   if(action!=='accept')fail('Nur der Superadmin darf freischalten',403);
   if(b.version!==a.version||b.confirmed!==true||a.status!=='quoted')fail('Aktuelles Angebot ausdrücklich bestätigen',409);
   await c.query("UPDATE ai_ads SET status='accepted',accepted_at=now(),updated_at=now() WHERE id=$1",[a.id]);
  }else if(action==='quote'){
   const cities=list(b.cities),postal=list(b.postalPrefixes,true),cuisines=list(b.cuisines||[]);
   if(!cities.length&&!postal.length)fail('Mindestens eine freigegebene Stadt oder PLZ-Region erforderlich');
   if(!Number.isSafeInteger(b.feeCents)||b.feeCents<0||b.feeCents>100000000)fail('Individuellen Nettopreis in Cent festlegen');
   if(!['dashboard','catalog','purchasing'].includes(b.placement))fail('Platzierung erforderlich');
   const start=new Date(b.startsAt),end=new Date(b.endsAt);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end<=new Date())fail('Gültigen zukünftigen Zeitraum wählen');
   await c.query("UPDATE ai_ads SET status='quoted',version=version+1,fee_cents=$2,starts_at=$3,ends_at=$4,cities=$5,postal_prefixes=$6,cuisines=$7,placement=$8,category=$9,admin_note=$10,accepted_at=NULL,approved_by=NULL,approved_at=NULL,payment_reference='',updated_at=now() WHERE id=$1",[a.id,b.feeCents,start.toISOString(),end.toISOString(),JSON.stringify(cities),JSON.stringify(postal),JSON.stringify(cuisines),b.placement,text(b.category||'',100).toLocaleLowerCase('de-DE'),text(b.note||'',1000)]);
  }else if(action==='approve'||action==='resume'){
   if(!(action==='approve'?a.status==='accepted':a.status==='paused')||!a.accepted_at||new Date(a.ends_at)<=new Date())fail('Bestätigtes, gültiges Angebot erforderlich',409);
   if(a.product_id&&!(await c.query(`SELECT 1 FROM ai_products p WHERE p.id=$1 AND p.active AND p.available AND ${snapshotSql}=$2::jsonb`,[a.product_id,JSON.stringify(a.product_snapshot)])).rowCount)fail('Produkt geändert oder nicht lieferbar. Neu einreichen.',409);
   await c.query("UPDATE ai_ads SET status='active',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1",[a.id,u.id]);
  }else if(action==='pause'||action==='reject'){
   await c.query('UPDATE ai_ads SET status=$2,admin_note=$3,updated_at=now() WHERE id=$1',[a.id,action==='pause'?'paused':'rejected',text(b.note||'',1000)]);
  }else if(action==='payment'){
   if(!a.accepted_at||a.fee_cents===null)fail('Noch kein bestätigtes Angebot',409);
   await c.query('UPDATE ai_ads SET payment_reference=$2,updated_at=now() WHERE id=$1',[a.id,text(b.reference,200,true)]);
  }else fail('Aktion nicht gefunden',404);
  await c.query('INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,$3,$4)',[u.id,a.id,'ad_'+action,JSON.stringify({version:a.version,...(action==='quote'?{feeCents:b.feeCents,startsAt:b.startsAt,endsAt:b.endsAt,cities:b.cities,postalPrefixes:b.postalPrefixes,placement:b.placement,cuisines:b.cuisines||[],category:b.category||'',note:b.note||''}: {}),...(action==='payment'?{reference:b.reference,feeCents:a.fee_cents}: {})})]);
  await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function placeTerms(input){
 const result={};
 for(const key of ['singular','plural']){
  const value=typeof input?.[key]==='string'?input[key].trim().normalize('NFC'):'';
  if(!/^[\p{L}][\p{L} -]{0,29}$/u.test(value))fail(400,'Einzahl und Mehrzahl mit jeweils 1 bis 30 Buchstaben angeben.');
  result[key]=value;
 }
 return result;
}
export function placeName(name,previous,next){
 const value=String(name).trim();
 if(/^\d+$/.test(value))return next==='Tisch'?value:next+' '+value;
 const prefix=new RegExp('^'+previous+'(?=\\s|\\d|$)','iu');
 return value.replace(prefix,next);
}
export const placeSettings=r=>({singular:r.table_term||'Tisch',plural:r.table_term_plural||'Tische',locked:Boolean(r.table_term_set_at),version:r.table_term_revision||0});
export async function migratePlaceTerminology(db){
 await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS table_term text NOT NULL DEFAULT 'Tisch';
 ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS table_term_plural text NOT NULL DEFAULT 'Tische';
 ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS table_term_set_at timestamptz;
 ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS table_term_revision int NOT NULL DEFAULT 0;
 CREATE TABLE IF NOT EXISTS place_terminology_requests(restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,request_id uuid,request_hash text NOT NULL,PRIMARY KEY(restaurant_id,request_id));
 CREATE OR REPLACE FUNCTION normalize_dining_place_name() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE term text;
 BEGIN
  SELECT table_term INTO term FROM restaurants WHERE id=NEW.restaurant_id FOR SHARE;
  IF term IS NOT NULL AND term <> 'Tisch' THEN
   IF NEW.name ~ '^[0-9]+$' THEN NEW.name := term || ' ' || NEW.name;
   ELSIF NEW.name ~* '^Tisch([[:space:]]|[0-9]|$)' THEN NEW.name := regexp_replace(NEW.name,'^Tisch',term,'i'); END IF;
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS dining_place_name ON dining_tables;
 CREATE TRIGGER dining_place_name BEFORE INSERT OR UPDATE OF name ON dining_tables FOR EACH ROW EXECUTE FUNCTION normalize_dining_place_name();`);
}

export function createPlaceTerminology(pool){
 return async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  const match=path.match(/^\/api\/v1\/(platform\/control\/)?restaurants\/([^/]+)\/place-terminology$/);
  if(!match)return false;
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
  const platform=Boolean(match[1]),rid=match[2];let db;
  try{
   if(!uuid.test(rid))fail(400,'Betrieb auswählen.');
   if(!['GET','PUT'].includes(req.method))return send(405,{error:'Methode nicht erlaubt.'});
   const token=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'')?.[1];
   if(!token)fail(401,'Bitte anmelden.');
   const input=req.method==='PUT'?await readJsonObject(req,{maxBytes:2000}):null;
   db=await pool.connect();await db.query('BEGIN');
   const actor=(await db.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR SHARE OF s,u",[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
   if(!actor)fail(401,'Bitte anmelden.');
   if(platform){
    if(!(await db.query('SELECT a.user_id FROM platform_admins a JOIN platform_owner o ON o.user_id=a.user_id WHERE a.user_id=$1 AND a.active=true FOR SHARE OF a,o',[actor.id])).rows.length)fail(403,'Nur für die Bringness-Plattformverwaltung.');
   }else if(!['owner','admin'].includes(actor.role))fail(403,'Nur für die Betriebsverwaltung.');
   const r=(await db.query('SELECT * FROM restaurants WHERE id=$1'+(platform?'':' AND company_id=$2')+' FOR UPDATE',platform?[rid]:[rid,actor.company_id])).rows[0];
   if(!r)fail(404,'Betrieb nicht gefunden.');
   if(input){
    const terms=placeTerms(input);
    if(!uuid.test(input.requestId||'')||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'Speicheranfrage prüfen.');
    if(platform&&(typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>300))fail(400,'Grund der abgesprochenen Änderung angeben.');
    const hash=crypto.createHash('sha256').update(JSON.stringify([actor.id,platform,terms,input.version,input.reason||''])).digest('hex');
    const old=(await db.query('SELECT request_hash FROM place_terminology_requests WHERE restaurant_id=$1 AND request_id=$2',[rid,input.requestId])).rows[0];
    if(old){if(old.request_hash!==hash)fail(409,'Vorgangskennung wurde bereits mit anderen Angaben verwendet.');await db.query('COMMIT');return send(200,{restaurantId:rid,...placeSettings(r),replayed:true})}
    if(!platform&&r.table_term_set_at)fail(403,'Bereits festgelegt. Spätere Änderungen erfolgen über Bringness.');
    if(r.table_term_revision!==input.version)fail(409,'Bezeichnung wurde zwischenzeitlich geändert. Status neu laden.');
    const tables=(await db.query('SELECT id,name FROM dining_tables WHERE restaurant_id=$1 ORDER BY id FOR UPDATE',[rid])).rows;
    await db.query('UPDATE restaurants SET table_term=$2,table_term_plural=$3,table_term_set_at=now(),table_term_revision=table_term_revision+1 WHERE id=$1',[rid,terms.singular,terms.plural]);
    for(const table of tables){const name=placeName(table.name,r.table_term,terms.singular);if(name!==table.name)await db.query('UPDATE dining_tables SET name=$2 WHERE id=$1',[table.id,name])}
    await db.query('INSERT INTO place_terminology_requests VALUES($1,$2,$3)',[rid,input.requestId,hash]);
    await db.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,'restaurant',$4,$5::jsonb)",[r.company_id,actor.id,platform?'place_terminology.admin_changed':'place_terminology.initialized',rid,JSON.stringify({previous:placeSettings(r),next:terms,reason:platform?input.reason.trim():null})]);
    Object.assign(r,{table_term:terms.singular,table_term_plural:terms.plural,table_term_set_at:true,table_term_revision:r.table_term_revision+1});
   }
   await db.query('COMMIT');return send(200,{restaurantId:rid,...placeSettings(r)});
  }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});return send(e.status||503,{error:e.status?e.message:'Bezeichnung momentan nicht verfügbar.'})}finally{db?.release()}
 };
}

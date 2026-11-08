import crypto from 'node:crypto';
import {shopActor,sessionHash} from './shop-account.js';
import {readJsonObject} from './http-body.js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,code});};
const keys=(object,expected)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join()===expected.sort().join();
const sequence=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n;
const columns='restaurant_id,company_id,request_id,event_number::text,kind,label,outcome,details,note,created_at,actor_id,actor_label,evidence_source,protocol_version';
export function normalizeDeviceCheck(body){
 if(!keys(body,['requestId','restaurantId','companyId','kind','label','outcome','details','note'])||![body.requestId,body.restaurantId,body.companyId].every(uuid))fail('Prüfprotokoll und Betrieb prüfen.');
 if(!['scanner','printer'].includes(body.kind)||!['unverified','user_confirmed','problem'].includes(body.outcome))fail('Prüfart oder Ergebnis prüfen.');
 if(typeof body.label!=='string'||!body.label.trim()||body.label.trim().length>100||/[\u0000-\u001f]/.test(body.label))fail('Geräte-/Arbeitsplatzbezeichnung prüfen.');
 if(typeof body.note!=='string'||body.note.trim().length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.note))fail('Fehlerbeschreibung prüfen.');
 let details;
 if(body.kind==='scanner'){
  if(!keys(body.details,['expectedCode','observedCode']))fail('Scannerangaben prüfen.');
  for(const value of Object.values(body.details))if(typeof value!=='string'||value.trim().length>200||/[\u0000-\u001f]/.test(value))fail('Testcodes prüfen.');
  details={expectedCode:body.details.expectedCode.trim(),observedCode:body.details.observedCode.trim()};
  if(body.outcome==='user_confirmed'&&(!details.expectedCode||details.expectedCode!==details.observedCode))fail('Bestätigung erfordert übereinstimmenden Soll- und empfangenen Code.');
 }else{
  if(!keys(body.details,['paperWidth','printRequested','paperSeen','legible','glyphs','output'])||!['58','80','other','unknown'].includes(body.details.paperWidth)||['printRequested','paperSeen','legible','glyphs','output'].some(key=>typeof body.details[key]!=='boolean'))fail('Druckerangaben prüfen.');
  details=Object.fromEntries(['paperWidth','printRequested','paperSeen','legible','glyphs','output'].map(key=>[key,body.details[key]]));
  if(body.outcome==='user_confirmed'&&(details.paperWidth==='unknown'||['printRequested','paperSeen','legible','glyphs','output'].some(key=>!details[key])))fail('Bestätigung erfordert geöffneten Testdruck und die vollständige Papierprüfung.');
 }
 if(body.outcome==='problem'&&!body.note.trim())fail('Bitte das festgestellte Problem beschreiben.');
 return {...body,label:body.label.trim(),note:body.note.trim(),details};
}
export async function migratePosDeviceChecks(pool){
 const db=await pool.connect();try{await db.query('BEGIN');
  await db.query(`CREATE TABLE IF NOT EXISTS pos_device_checks(
   company_id uuid NOT NULL REFERENCES companies(id),restaurant_id uuid NOT NULL REFERENCES restaurants(id),request_id uuid NOT NULL,
   event_number bigint NOT NULL CHECK(event_number>0),kind text NOT NULL CHECK(kind IN ('scanner','printer')),label varchar(100) NOT NULL,
   outcome text NOT NULL CHECK(outcome IN ('unverified','user_confirmed','problem')),details jsonb NOT NULL,note varchar(500) NOT NULL,
   created_at timestamptz NOT NULL DEFAULT clock_timestamp(),actor_id uuid NOT NULL,actor_label varchar(200) NOT NULL,
   digest text NOT NULL CHECK(length(digest)=64),evidence_source text NOT NULL DEFAULT 'user_report' CHECK(evidence_source='user_report'),protocol_version int NOT NULL DEFAULT 1 CHECK(protocol_version=1),
   PRIMARY KEY(company_id,restaurant_id,request_id),UNIQUE(company_id,restaurant_id,event_number))`);
  await db.query(`CREATE OR REPLACE FUNCTION pos_device_checks_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'POS device checks are read only' USING ERRCODE='55000'; END $$`);
  await db.query('DROP TRIGGER IF EXISTS pos_device_checks_no_edit ON pos_device_checks');
  await db.query('CREATE TRIGGER pos_device_checks_no_edit BEFORE UPDATE OR DELETE ON pos_device_checks FOR EACH ROW EXECUTE FUNCTION pos_device_checks_immutable()');
  await db.query('DROP TRIGGER IF EXISTS pos_device_checks_no_truncate ON pos_device_checks');
  await db.query('CREATE TRIGGER pos_device_checks_no_truncate BEFORE TRUNCATE ON pos_device_checks FOR EACH STATEMENT EXECUTE FUNCTION pos_device_checks_immutable()');
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}
function parseQuery(params){
 const allowed=['restaurantId','companyId','kind','requestId','asOf','cursor','limit'];
 if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))fail('Ungültige Protokollabfrage.');
 const b=Object.fromEntries(params);if(!uuid(b.restaurantId)||b.companyId!==undefined&&!uuid(b.companyId)||b.requestId!==undefined&&!uuid(b.requestId))fail('Betrieb oder Protokoll prüfen.');
 if(b.kind!==undefined&&!['scanner','printer'].includes(b.kind))fail('Prüfart prüfen.');
 if(b.asOf!==undefined&&(!sequence(b.asOf)||!uuid(b.companyId))||b.cursor!==undefined&&(!sequence(b.cursor)||b.cursor==='0'||b.asOf===undefined||BigInt(b.cursor)>BigInt(b.asOf)))fail('Ungültige Protokollseite.');
 b.limit=b.limit??'25';if(!/^[1-9][0-9]?$/.test(b.limit)||Number(b.limit)>50)fail('Seitengröße prüfen.');b.limit=Number(b.limit);return b;
}
export function createPosDeviceChecks(pool){return async(req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname!=='/api/v1/pos-device-checks')return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true;};let db;
 try{
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Methode nicht erlaubt'});
  const token=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'')?.[1];if(!token)fail('Nicht angemeldet',401);
  let b;if(req.method==='POST'){
   if(req.headers.origin!=='https://bringness.de')fail('Herkunft nicht erlaubt',403);if(u.search)fail('Ungültige Speicheranfrage.');b=normalizeDeviceCheck(await readJsonObject(req,{maxBytes:8192}));
  }else b=parseQuery(u.searchParams);
  db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,sessionHash(token),true);
  if(!(await db.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[b.restaurantId,actor.company_id])).rows.length)fail('Betrieb nicht gefunden',404);
  if(b.companyId&&b.companyId!==actor.company_id)fail('Betriebskontext geändert. Prüfprotokolle bitte neu laden.',409,'DEVICE_SCOPE_CHANGED');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pos-device-checks:'+b.restaurantId]);let result;
  if(req.method==='POST'){
   const digest=crypto.createHash('sha256').update(JSON.stringify([b.kind,b.label,b.outcome,b.details,b.note])).digest('hex');
   const old=(await db.query('SELECT digest FROM pos_device_checks WHERE company_id=$1 AND restaurant_id=$2 AND request_id=$3',[actor.company_id,b.restaurantId,b.requestId])).rows[0];
   if(old){if(old.digest!==digest)fail('Vorgangskennung wurde mit anderen Angaben verwendet.',409);}
   else{
    const author=(await db.query("SELECT u.id,u.display_name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.company_id=$2 AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[sessionHash(token),actor.company_id])).rows[0];if(!author)fail('Nicht angemeldet',401);
    await db.query(`INSERT INTO pos_device_checks(company_id,restaurant_id,request_id,event_number,kind,label,outcome,details,note,actor_id,actor_label,digest)
     VALUES($1,$2,$3,(SELECT coalesce(max(event_number),0)+1 FROM pos_device_checks WHERE company_id=$1 AND restaurant_id=$2),$4,$5,$6,$7,$8,$9,$10,$11)`,[actor.company_id,b.restaurantId,b.requestId,b.kind,b.label,b.outcome,b.details,b.note,author.id,String(author.display_name||'Betriebsverwaltung').slice(0,200),digest]);
   }
   const check=(await db.query('SELECT '+columns+' FROM pos_device_checks WHERE company_id=$1 AND restaurant_id=$2 AND request_id=$3',[actor.company_id,b.restaurantId,b.requestId])).rows[0];result={restaurantId:b.restaurantId,companyId:actor.company_id,requestId:b.requestId,check};
  }else{
   const latest=(await db.query('SELECT coalesce(max(event_number),0)::text AS last FROM pos_device_checks WHERE company_id=$1 AND restaurant_id=$2',[actor.company_id,b.restaurantId])).rows[0].last;
   const asOf=b.asOf??latest;if(BigInt(asOf)>BigInt(latest))fail('Ungültiger Protokollstand.');
   const rows=(await db.query('SELECT '+columns+` FROM pos_device_checks WHERE company_id=$1 AND restaurant_id=$2 AND event_number<=$3::bigint AND ($4::bigint IS NULL OR event_number<$4::bigint) AND ($5::text IS NULL OR kind=$5::text) AND ($6::uuid IS NULL OR request_id=$6::uuid) ORDER BY event_number DESC LIMIT $7`,[actor.company_id,b.restaurantId,asOf,b.cursor??null,b.kind??null,b.requestId??null,b.limit+1])).rows;
   const more=rows.length>b.limit,selected=rows.slice(0,b.limit);result={restaurantId:b.restaurantId,companyId:actor.company_id,asOf:String(asOf),rows:selected,nextCursor:more?selected.at(-1).event_number:null};
  }
  await db.query('COMMIT');return send(200,result);
 }catch(error){if(db)await db.query('ROLLBACK');const status=error.status||({UNAUTHORIZED:401,FORBIDDEN:403}[error.code])||503;return send(status,{error:status===503?'Prüfprotokolle derzeit nicht verfügbar.':error.message||'Zugriff nicht erlaubt',...(error.code==='DEVICE_SCOPE_CHANGED'?{code:error.code}:{})});}finally{db?.release()}
};}

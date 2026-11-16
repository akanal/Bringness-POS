import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';

export const diagnosticVersion='pos-diagnostics-admin-20261116';
const scopes=new Set(['LOGIN','REGISTER','RESET','LOAD','SAVE','CONNECTION','START','DISPLAY','PERSONNEL','CATALOG','TAX','AVAILABILITY','STOCK','TRADE']);
const technical=new Set(['NETWORK','TIMEOUT','RESPONSE','SERVER','STORAGE','FAILED']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export function validateDiagnosticReport(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['eventId','code','version','online','restaurantId'].includes(key)))return null;
 const match=/^POS-([A-Z]+)-([A-Z]+)$/.exec(value.code||'');
 if(!uuid.test(value.eventId||'')||!match||!scopes.has(match[1])||!technical.has(match[2])||value.version!==diagnosticVersion||typeof value.online!=='boolean')return null;
 if(value.restaurantId!==undefined&&value.restaurantId!==null&&!uuid.test(value.restaurantId))return null;
 return {eventId:value.eventId.toLowerCase(),code:value.code,version:value.version,online:value.online,restaurantId:value.restaurantId?.toLowerCase()||null};
}
export async function migratePosDiagnosticReports(db){
 await db.query(`CREATE TABLE IF NOT EXISTS pos_diagnostic_reports(
 id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,restaurant_key text NOT NULL,
 code text NOT NULL,component_version text NOT NULL,online boolean NOT NULL,
 occurrences bigint NOT NULL DEFAULT 1,first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','resolved')),revision integer NOT NULL DEFAULT 1,
 UNIQUE(company_id,restaurant_key,code,component_version));
 CREATE INDEX IF NOT EXISTS pos_diagnostic_recent ON pos_diagnostic_reports(last_seen_at DESC);
 CREATE TABLE IF NOT EXISTS pos_diagnostic_events(company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,event_id uuid NOT NULL,event_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,event_id));
 CREATE INDEX IF NOT EXISTS pos_diagnostic_event_age ON pos_diagnostic_events(created_at);`);
}
export async function cleanupPosDiagnosticReports(db){
 await db.query("DELETE FROM pos_diagnostic_events WHERE created_at<now()-interval '24 hours'");
 await db.query("DELETE FROM pos_diagnostic_reports WHERE last_seen_at<now()-interval '30 days'");
}
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
export function createPosDiagnosticReports(pool,{publicOrigin='https://bringness.de',now=Date.now,maxPerUser=12,maxGlobal=120}={}){
 const origins=new Set([new URL(publicOrigin).origin,'https://bringness-pos.de']);
 const limits=new Map();let global={start:0,count:0};
 function allowed(id){
  const time=now();for(const [key,bucket]of limits)if(time-bucket.start>=60000)limits.delete(key);
  if(time-global.start>=60000)global={start:time,count:0};
  const current=limits.get(id)||{start:time,count:0};
  if(current.count>=maxPerUser||global.count>=maxGlobal||!limits.has(id)&&limits.size>=2000)return false;
  current.count++;global.count++;limits.set(id,current);return true;
 }
 async function actor(req,db=pool,platform=false){
  const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!bearer||bearer.length>512)return null;
  const result=await db.query(`SELECT u.id,u.company_id FROM sessions s JOIN users u ON u.id=s.user_id
   ${platform?'JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true':''}
   WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,[hash(bearer)]);
  return result.rows[0]||null;
 }
 return async(req,res)=>{
  const url=new URL(req.url,'http://local'),ingest=url.pathname==='/api/v1/pos-diagnostics',admin=url.pathname==='/api/v1/platform/control/diagnostics',summary=url.pathname==='/api/v1/platform/control/diagnostics/summary',change=/^\/api\/v1\/platform\/control\/diagnostics\/([0-9a-f-]+)\/status$/.exec(url.pathname);
  if(!ingest&&!admin&&!summary&&!change)return false;
  const user=await actor(req,pool,!ingest);if(!user){send(res,ingest?401:403,{error:ingest?'Bitte anmelden.':'Nur Bringness-Plattformadministratoren.'});return true;}
  if(req.method==='POST'&&!origins.has(req.headers.origin)){send(res,403,{error:'Ungültiger Ursprung.'});return true;}
  if(ingest&&req.method==='POST'){
   if(!allowed(user.id)){res.setHeader?.('Retry-After','60');send(res,429,{error:'Diagnosemeldungen vorübergehend begrenzt.'});return true;}
   let input;try{if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error();input=validateDiagnosticReport(await readJsonObject(req,{maxBytes:1024}));}catch{input=null;}
   if(!input){send(res,400,{error:'Ungültige Diagnose.'});return true;}
   const client=await pool.connect();const fingerprint=hash(JSON.stringify([input.code,input.version,input.online,input.restaurantId]));
   try{
    await client.query('BEGIN');
    const fresh=await actor(req,client);if(!fresh||fresh.company_id!==user.company_id){await client.query('ROLLBACK');send(res,401,{error:'Anmeldung geändert.'});return true;}
    if(input.restaurantId&&!(await client.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2',[input.restaurantId,user.company_id])).rowCount){await client.query('ROLLBACK');send(res,403,{error:'Betrieb nicht verfügbar.'});return true;}
    const old=(await client.query('SELECT event_hash FROM pos_diagnostic_events WHERE company_id=$1 AND event_id=$2',[user.company_id,input.eventId])).rows[0];
    if(old){await client.query('COMMIT');send(res,old.event_hash===fingerprint?202:409,old.event_hash===fingerprint?{accepted:true}:{error:'Diagnosekennung bereits anders verwendet.'});return true;}
    await client.query(`INSERT INTO pos_diagnostic_reports(id,company_id,restaurant_id,restaurant_key,code,component_version,online)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,restaurant_key,code,component_version) DO UPDATE SET
     occurrences=pos_diagnostic_reports.occurrences+1,last_seen_at=now(),online=EXCLUDED.online,
     state=CASE WHEN pos_diagnostic_reports.state='resolved' THEN 'open' ELSE pos_diagnostic_reports.state END,revision=pos_diagnostic_reports.revision+1`,[crypto.randomUUID(),user.company_id,input.restaurantId,input.restaurantId||'',input.code,input.version,input.online]);
    const event=await client.query('INSERT INTO pos_diagnostic_events(company_id,event_id,event_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[user.company_id,input.eventId,fingerprint]);
    if(!event.rowCount){await client.query('ROLLBACK');const prior=(await pool.query('SELECT event_hash FROM pos_diagnostic_events WHERE company_id=$1 AND event_id=$2',[user.company_id,input.eventId])).rows[0];send(res,prior?.event_hash===fingerprint?202:409,prior?.event_hash===fingerprint?{accepted:true}:{error:'Diagnosekennung bereits anders verwendet.'});return true;}
    await client.query('COMMIT');send(res,202,{accepted:true});
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   return true;
  }
  if(summary&&req.method==='GET'){const count=await pool.query("SELECT count(*)::int count FROM pos_diagnostic_reports WHERE state<>'resolved' AND last_seen_at>=now()-interval '30 days'");send(res,200,{openCount:count.rows[0].count});return true;}
  if(admin&&req.method==='GET'){
   const state=url.searchParams.get('state')||'active';if(!['active','resolved','all'].includes(state)){send(res,400,{error:'Ungültiger Filter.'});return true;}
   const rows=await pool.query(`SELECT d.id,d.company_id,d.restaurant_id,d.code,d.component_version,d.online,d.occurrences,d.first_seen_at,d.last_seen_at,d.state,d.revision,c.name company_name,r.name restaurant_name
    FROM pos_diagnostic_reports d JOIN companies c ON c.id=d.company_id LEFT JOIN restaurants r ON r.id=d.restaurant_id
    WHERE d.last_seen_at>=now()-interval '30 days' AND ($1='all' OR $1='active' AND d.state<>'resolved' OR $1='resolved' AND d.state='resolved') ORDER BY d.last_seen_at DESC,d.id LIMIT 100`,[state]);
   const count=await pool.query("SELECT count(*)::int count FROM pos_diagnostic_reports WHERE state<>'resolved' AND last_seen_at>=now()-interval '30 days'");
   send(res,200,{reports:rows.rows,openCount:count.rows[0].count,limited:rows.rows.length===100});return true;
  }
  if(change&&req.method==='POST'){
   let input;try{input=await readJsonObject(req,{maxBytes:1024});}catch{input=null;}
   if(!uuid.test(change[1])||!input||Object.keys(input).some(k=>!['state','revision'].includes(k))||!['acknowledged','resolved'].includes(input.state)||!Number.isSafeInteger(input.revision)||input.revision<1){send(res,400,{error:'Ungültiger Status.'});return true;}
   const client=await pool.connect();try{
    await client.query('BEGIN');if(!await actor(req,client,true)){await client.query('ROLLBACK');send(res,403,{error:'Freigabe geändert.'});return true;}
    const updated=await client.query('UPDATE pos_diagnostic_reports SET state=$2,revision=revision+1 WHERE id=$1 AND revision=$3 RETURNING id,company_id,state,revision',[change[1],input.state,input.revision]);
    if(!updated.rowCount){await client.query('ROLLBACK');send(res,409,{error:'Meldung inzwischen aktualisiert. Bitte neu laden und prüfen.'});return true;}
    await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'pos.diagnostic.status','diagnostic',$3,$4::jsonb)",[updated.rows[0].company_id,user.id,change[1],JSON.stringify({state:input.state})]);
    await client.query('COMMIT');send(res,200,{report:updated.rows[0]});
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}return true;
  }
  send(res,405,{error:'Methode nicht erlaubt.'});return true;
 };
}

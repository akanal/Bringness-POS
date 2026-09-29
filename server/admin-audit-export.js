import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const validDate=value=>!value||(datePattern.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
function error(res,status,message){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({error:message}))}
function csv(value){const text=String(value??"");const safe=/^[=+@\-\t\r]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"'}
export async function handleAdminAuditExport(req,res){
  const url=new URL(req.url,"http://localhost");
  if(url.pathname!=="/api/v1/admin/audit/export"||req.method!=="GET")return false;
  const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!bearer){error(res,401,"Bitte anmelden");return true}
  const tokenHash=crypto.createHash("sha256").update(bearer).digest("hex");
  const actor=(await pool.query(`SELECT u.id,u.company_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.role IN ('owner','admin')`,[tokenHash])).rows[0];
  if(!actor){error(res,403,"Kein Admin-Zugriff");return true}
  const from=url.searchParams.get("from"),to=url.searchParams.get("to");
  if(!validDate(from)||!validDate(to)||(from&&to&&from>to)){
    error(res,400,"Ungültiger Datumsbereich");return true;
  }
  const query=await pool.query(`SELECT a.created_at,a.event_type,a.entity_type,a.entity_id,u.email actor_email
    FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE a.company_id=$1 AND ($2::date IS NULL OR a.created_at >= $2::date)
      AND ($3::date IS NULL OR a.created_at < $3::date + interval '1 day')
    ORDER BY a.id DESC LIMIT 10001`,[actor.company_id,from||null,to||null]);
  if(query.rowCount>10000){error(res,413,"Mehr als 10.000 Einträge. Bitte Datumsbereich verkleinern.");return true}
  const lines=["Zeitpunkt;Aktion;Objekttyp;Objekt-ID;Ausgeführt von",...query.rows.map(row=>[
    row.created_at?.toISOString(),row.event_type,row.entity_type,row.entity_id,row.actor_email
  ].map(csv).join(";"))];
  res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=bringness-admin-protokoll.csv","cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end("\uFEFF"+lines.join("\r\n")+"\r\n");return true;
}

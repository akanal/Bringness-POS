import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,status,data){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(data));
}
async function readBody(req){
  let raw="";
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>16384)throw Error("Anfrage zu groß");
  }
  return raw?JSON.parse(raw):{};
}
async function platformUser(req){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const result=await pool.query(`
    SELECT u.id FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'
  `,[hash]);
  return result.rows[0]||null;
}

export async function handlePlatformControl(req,res){
  const url=new URL(req.url,"http://localhost");
  if(!url.pathname.startsWith("/api/v1/platform/control/"))return false;
  const actor=await platformUser(req);
  if(!actor){send(res,403,{error:"Nur Bringness-Plattformadministratoren"});return true}
  const p=url.pathname;
  if(p==="/api/v1/platform/control/registers"&&req.method==="GET"){
    const q=await pool.query(`
      SELECT r.id,r.company_id,r.name,r.mode,c.name company_name,
        (SELECT count(*)::int FROM orders o WHERE o.restaurant_id=r.id) order_count,
        (SELECT count(*)::int FROM receipts rc JOIN orders o ON o.id=rc.order_id
          WHERE o.restaurant_id=r.id AND rc.fiscal_status IS DISTINCT FROM 'signed') unsigned_receipts
      FROM restaurants r JOIN companies c ON c.id=r.company_id
      ORDER BY c.name,r.name LIMIT 500
    `);
    const d=await pool.query(`
      SELECT d.id,d.company_id,d.name,d.platform,d.app_version,d.status,d.last_seen_at,
        c.name company_name,
        (SELECT count(*)::int FROM device_commands dc WHERE dc.device_id=d.id AND dc.status='pending') pending_commands
      FROM devices d JOIN companies c ON c.id=d.company_id
      ORDER BY d.last_seen_at DESC NULLS LAST LIMIT 500
    `);
    send(res,200,{restaurants:q.rows,devices:d.rows});return true;
  }
  const restaurant=p.match(/^\/api\/v1\/platform\/control\/registers\/([^/]+)$/);
  if(restaurant&&req.method==="PATCH"){
    if(!uuid.test(restaurant[1])){send(res,400,{error:"Ungültiger Betrieb"});return true}
    let body;try{body=await readBody(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const name=String(body.name||"").trim(),mode=String(body.mode||"");
    if(name.length<2||name.length>120||!["counter","restaurant"].includes(mode)){
      send(res,400,{error:"Betriebsname oder Betriebsart ungültig"});return true;
    }
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const old=(await client.query("SELECT id,company_id,name,mode FROM restaurants WHERE id=$1 FOR UPDATE",[restaurant[1]])).rows[0];
      if(!old){await client.query("ROLLBACK");send(res,404,{error:"Betrieb nicht gefunden"});return true}
      const updated=(await client.query("UPDATE restaurants SET name=$2,mode=$3 WHERE id=$1 RETURNING id,company_id,name,mode",[old.id,name,mode])).rows[0];
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.restaurant.updated','restaurant',$3,$4)",[old.company_id,actor.id,old.id,JSON.stringify({before:{name:old.name,mode:old.mode},after:{name,mode}})]);
      await client.query("COMMIT");
      send(res,200,{restaurant:updated});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  const device=p.match(/^\/api\/v1\/platform\/control\/devices\/([^/]+)\/sync$/);
  if(device&&req.method==="POST"){
    if(!uuid.test(device[1])){send(res,400,{error:"Ungültiges Gerät"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const d=(await client.query("SELECT id,company_id,status FROM devices WHERE id=$1 FOR UPDATE",[device[1]])).rows[0];
      if(!d){await client.query("ROLLBACK");send(res,404,{error:"Gerät nicht gefunden"});return true}
      if(d.status!=="active"){await client.query("ROLLBACK");send(res,409,{error:"Gerät ist nicht aktiv"});return true}
      const existing=(await client.query("SELECT id,status,created_at FROM device_commands WHERE device_id=$1 AND command='sync' AND status='pending' ORDER BY created_at LIMIT 1",[d.id])).rows[0];
      const command=existing||(await client.query("INSERT INTO device_commands(device_id,command,created_by) VALUES($1,'sync',$2) RETURNING id,status,created_at",[d.id,actor.id])).rows[0];
      if(!existing)await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.device.sync_queued','device',$3,$4)",[d.company_id,actor.id,d.id,JSON.stringify({commandId:command.id})]);
      await client.query("COMMIT");
      send(res,202,{command,delivery:"when_online"});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  send(res,404,{error:"Admin-Funktion nicht gefunden"});return true;
}

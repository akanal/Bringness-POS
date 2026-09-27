import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false,
});

function sendJson(res,status,payload){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(payload));
}
function bearer(req){return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"")}
async function body(req){return new Promise((resolve,reject)=>{let data="";req.on("data",c=>data+=c);req.on("end",()=>{try{resolve(data?JSON.parse(data):{})}catch(reject)})})}
async function currentUser(req){
  const token=bearer(req); if(!token)return null;
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const q=await pool.query(`SELECT u.id,u.company_id,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`,[tokenHash]);
  return q.rows[0]||null;
}
async function activeDownloadEntitlement(companyId){
  const q=await pool.query(`SELECT ce.id,ce.purchased_at FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active' ORDER BY ce.purchased_at DESC NULLS LAST,ce.created_at DESC LIMIT 1`,[companyId]);
  return q.rows[0]||null;
}
export async function migrateDeviceLicense(){
  await pool.query(`
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'unbound';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS activated_at timestamptz;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_device_per_entitlement
      ON devices(entitlement_id)
      WHERE entitlement_id IS NOT NULL AND activation_status='active' AND status='active';
  `);
}
export async function handleDeviceLicense(req,res){
  const url=new URL(req.url,"http://localhost");
  if(!["/api/v1/license/device/activate","/api/v1/license/device/status"].includes(url.pathname))return false;
  const user=await currentUser(req);
  if(!user){sendJson(res,401,{error:"Nicht angemeldet"});return true}
  const entitlement=await activeDownloadEntitlement(user.company_id);
  if(!entitlement){sendJson(res,402,{active:false,error:"Keine aktive Download-Lizenz vorhanden.",purchaseRequired:true});return true}

  if(url.pathname==="/api/v1/license/device/status"&&req.method==="GET"){
    const deviceKey=String(url.searchParams.get("deviceKey")||"").trim();
    if(!deviceKey){sendJson(res,400,{error:"deviceKey fehlt"});return true}
    const q=await pool.query(`SELECT id,name,platform,app_version,activation_status,activated_at,last_seen_at FROM devices WHERE company_id=$1 AND device_key=$2 AND entitlement_id=$3 LIMIT 1`,[user.company_id,deviceKey,entitlement.id]);
    const d=q.rows[0]||null;
    sendJson(res,200,{active:Boolean(d&&d.activation_status==='active'),device:d,entitlementId:entitlement.id});return true;
  }

  if(url.pathname==="/api/v1/license/device/activate"&&req.method==="POST"){
    const b=await body(req),deviceKey=String(b.deviceKey||"").trim();
    if(deviceKey.length<16){sendJson(res,400,{error:"Ungültige Geräte-ID"});return true}
    const existing=await pool.query(`SELECT id,device_key,name FROM devices WHERE entitlement_id=$1 AND activation_status='active' AND status='active' LIMIT 1`,[entitlement.id]);
    if(existing.rowCount&&existing.rows[0].device_key!==deviceKey){
      sendJson(res,409,{active:false,deviceLimitReached:true,error:"Diese Download-Lizenz ist bereits auf einem anderen Gerät aktiviert.",activeDevice:{id:existing.rows[0].id,name:existing.rows[0].name}});return true;
    }
    const name=String(b.name||"Windows POS").slice(0,120),platform=String(b.platform||"windows").slice(0,40),appVersion=String(b.appVersion||"").slice(0,40);
    const q=await pool.query(`INSERT INTO devices(company_id,device_key,name,platform,app_version,status,last_seen_at,entitlement_id,activation_status,activated_at,deactivated_at)
      VALUES($1,$2,$3,$4,$5,'active',now(),$6,'active',now(),NULL)
      ON CONFLICT(device_key) DO UPDATE SET
        company_id=EXCLUDED.company_id,name=EXCLUDED.name,platform=EXCLUDED.platform,app_version=EXCLUDED.app_version,status='active',last_seen_at=now(),entitlement_id=EXCLUDED.entitlement_id,activation_status='active',activated_at=COALESCE(devices.activated_at,now()),deactivated_at=NULL
      RETURNING id,name,platform,app_version,activation_status,activated_at`,[user.company_id,deviceKey,name,platform,appVersion,entitlement.id]);
    await pool.query(`INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'download_device_activated','device',$3,$4)`,[user.company_id,user.id,q.rows[0].id,JSON.stringify({entitlementId:entitlement.id,deviceKeyHash:crypto.createHash('sha256').update(deviceKey).digest('hex')})]);
    sendJson(res,200,{active:true,device:q.rows[0],entitlementId:entitlement.id,deviceLimit:1});return true;
  }

  sendJson(res,405,{error:"Methode nicht erlaubt"});return true;
}

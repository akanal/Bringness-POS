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
async function body(req){
  return new Promise((resolve,reject)=>{
    let data="";
    req.on("data",c=>data+=c);
    req.on("end",()=>{
      try{resolve(data?JSON.parse(data):{})}
      catch(err){reject(err)}
    });
  });
}
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
function versionParts(version){return String(version||"").split(/[^0-9]+/).filter(Boolean).slice(0,4).map(Number)}
function isNewer(candidate,current){
  const a=versionParts(candidate),b=versionParts(current),n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++){const av=a[i]||0,bv=b[i]||0;if(av>bv)return true;if(av<bv)return false}
  return false;
}
async function updateForDevice(companyId,currentVersion){
  const q=await pool.query(`SELECT id,version,paid_upgrade,upgrade_plan_code,purchase_url,release_notes FROM software_releases WHERE active=true AND platform='windows' AND channel='stable' ORDER BY created_at DESC LIMIT 1`);
  if(!q.rowCount||!isNewer(q.rows[0].version,currentVersion))return null;
  const release=q.rows[0];
  let upgradeOwned=false;
  if(release.paid_upgrade&&release.upgrade_plan_code){
    const owned=await pool.query(`SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code=$2 AND ce.status='active' LIMIT 1`,[companyId,release.upgrade_plan_code]);
    upgradeOwned=Boolean(owned.rowCount);
  }
  const purchaseRequired=Boolean(release.paid_upgrade&&!upgradeOwned);
  return {
    available:true,
    version:release.version,
    releaseNotes:release.release_notes||null,
    purchaseRequired,
    included:!purchaseRequired,
    purchaseUrl:purchaseRequired?(release.purchase_url||"/preise/"):null,
    downloadPath:purchaseRequired?null:"/api/v1/downloads/windows/file"
  };
}
function leaseUntil(){
  const days=Math.max(1,Math.min(30,Number(process.env.DOWNLOAD_LICENSE_OFFLINE_DAYS||7)||7));
  return new Date(Date.now()+days*86400000);
}
export async function migrateDeviceLicense(){
  await pool.query(`
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'unbound';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS activated_at timestamptz;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_license_check_at timestamptz;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS license_valid_until timestamptz;
    ALTER TABLE software_releases ADD COLUMN IF NOT EXISTS paid_upgrade boolean NOT NULL DEFAULT false;
    ALTER TABLE software_releases ADD COLUMN IF NOT EXISTS upgrade_plan_code text;
    ALTER TABLE software_releases ADD COLUMN IF NOT EXISTS purchase_url text;
    ALTER TABLE software_releases ADD COLUMN IF NOT EXISTS release_notes text;
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_device_per_entitlement
      ON devices(entitlement_id)
      WHERE entitlement_id IS NOT NULL AND activation_status='active' AND status='active';
  `);
}
async function checkedDevice(user,entitlement,deviceKey,appVersion){
  const q=await pool.query(`SELECT id,name,platform,app_version,activation_status,activated_at,last_seen_at,license_valid_until FROM devices WHERE company_id=$1 AND device_key=$2 AND entitlement_id=$3 LIMIT 1`,[user.company_id,deviceKey,entitlement.id]);
  const device=q.rows[0]||null;
  if(!device||device.activation_status!=="active")return {active:false,device:null,error:"Dieses Gerät ist für die Download-Lizenz nicht aktiviert."};
  const validUntil=leaseUntil();
  await pool.query(`UPDATE devices SET app_version=$2,last_seen_at=now(),last_license_check_at=now(),license_valid_until=$3 WHERE id=$1`,[device.id,String(appVersion||"").slice(0,40),validUntil]);
  const update=await updateForDevice(user.company_id,appVersion);
  return {active:true,device:{...device,app_version:appVersion,license_valid_until:validUntil},validUntil:validUntil.toISOString(),checkIntervalMinutes:360,update};
}
export async function handleDeviceLicense(req,res){
  const url=new URL(req.url,"http://localhost");
  if(!["/api/v1/license/device/activate","/api/v1/license/device/status","/api/v1/license/device/check"].includes(url.pathname))return false;
  const user=await currentUser(req);
  if(!user){sendJson(res,401,{error:"Nicht angemeldet"});return true}
  const entitlement=await activeDownloadEntitlement(user.company_id);
  if(!entitlement){sendJson(res,402,{active:false,error:"Keine aktive Download-Lizenz vorhanden.",purchaseRequired:true});return true}

  if(url.pathname==="/api/v1/license/device/status"&&req.method==="GET"){
    const deviceKey=String(url.searchParams.get("deviceKey")||"").trim();
    if(!deviceKey){sendJson(res,400,{error:"deviceKey fehlt"});return true}
    const q=await pool.query(`SELECT id,name,platform,app_version,activation_status,activated_at,last_seen_at,last_license_check_at,license_valid_until FROM devices WHERE company_id=$1 AND device_key=$2 AND entitlement_id=$3 LIMIT 1`,[user.company_id,deviceKey,entitlement.id]);
    const d=q.rows[0]||null;
    sendJson(res,200,{active:Boolean(d&&d.activation_status==='active'),device:d,entitlementId:entitlement.id});return true;
  }

  if(url.pathname==="/api/v1/license/device/check"&&req.method==="POST"){
    const b=await body(req),deviceKey=String(b.deviceKey||"").trim(),appVersion=String(b.appVersion||"").trim();
    if(deviceKey.length<16){sendJson(res,400,{active:false,error:"Ungültige Geräte-ID"});return true}
    const result=await checkedDevice(user,entitlement,deviceKey,appVersion);
    if(!result.active){sendJson(res,409,result);return true}
    sendJson(res,200,{...result,entitlementId:entitlement.id,deviceLimit:1});return true;
  }

  if(url.pathname==="/api/v1/license/device/activate"&&req.method==="POST"){
    const b=await body(req),deviceKey=String(b.deviceKey||"").trim();
    if(deviceKey.length<16){sendJson(res,400,{error:"Ungültige Geräte-ID"});return true}
    const existing=await pool.query(`SELECT id,device_key,name FROM devices WHERE entitlement_id=$1 AND activation_status='active' AND status='active' LIMIT 1`,[entitlement.id]);
    if(existing.rowCount&&existing.rows[0].device_key!==deviceKey){
      sendJson(res,409,{active:false,deviceLimitReached:true,error:"Diese Download-Lizenz ist bereits auf einem anderen Gerät aktiviert.",activeDevice:{id:existing.rows[0].id,name:existing.rows[0].name}});return true;
    }
    const name=String(b.name||"Windows POS").slice(0,120),platform=String(b.platform||"windows").slice(0,40),appVersion=String(b.appVersion||"").slice(0,40),validUntil=leaseUntil();
    const q=await pool.query(`INSERT INTO devices(company_id,device_key,name,platform,app_version,status,last_seen_at,entitlement_id,activation_status,activated_at,deactivated_at,last_license_check_at,license_valid_until)
      VALUES($1,$2,$3,$4,$5,'active',now(),$6,'active',now(),NULL,now(),$7)
      ON CONFLICT(device_key) DO UPDATE SET
        company_id=EXCLUDED.company_id,name=EXCLUDED.name,platform=EXCLUDED.platform,app_version=EXCLUDED.app_version,status='active',last_seen_at=now(),entitlement_id=EXCLUDED.entitlement_id,activation_status='active',activated_at=COALESCE(devices.activated_at,now()),deactivated_at=NULL,last_license_check_at=now(),license_valid_until=EXCLUDED.license_valid_until
      RETURNING id,name,platform,app_version,activation_status,activated_at,license_valid_until`,[user.company_id,deviceKey,name,platform,appVersion,entitlement.id,validUntil]);
    await pool.query(`INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'download_device_activated','device',$3,$4)`,[user.company_id,user.id,q.rows[0].id,JSON.stringify({entitlementId:entitlement.id,deviceKeyHash:crypto.createHash('sha256').update(deviceKey).digest('hex')})]);
    const update=await updateForDevice(user.company_id,appVersion);
    sendJson(res,200,{active:true,device:q.rows[0],entitlementId:entitlement.id,deviceLimit:1,validUntil:validUntil.toISOString(),checkIntervalMinutes:360,update});return true;
  }

  sendJson(res,405,{error:"Methode nicht erlaubt"});return true;
}

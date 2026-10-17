import {readJsonObject} from './http-body.js';
import {activateLicensedDevice,renewLicensedDevice,deviceKeyValue} from './device-license-core.js';
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
const body=req=>readJsonObject(req,{maxBytes:8192});
async function currentUser(db,req){
  const token=bearer(req); if(!token)return null;
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const q=await db.query(`SELECT u.id,u.company_id,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,[tokenHash]);
  return q.rows[0]||null;
}
async function activeDownloadEntitlement(db,companyId){
  const q=await db.query(`SELECT ce.id,ce.purchased_at FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active' ORDER BY ce.purchased_at DESC NULLS LAST,ce.created_at DESC LIMIT 1`,[companyId]);
  return q.rows[0]||null;
}
function versionParts(version){return String(version||"").split(/[^0-9]+/).filter(Boolean).slice(0,4).map(Number)}
function isNewer(candidate,current){
  const a=versionParts(candidate),b=versionParts(current),n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++){const av=a[i]||0,bv=b[i]||0;if(av>bv)return true;if(av<bv)return false}
  return false;
}
async function updateForDevice(db,companyId,currentVersion){
  const q=await db.query(`SELECT id,version,paid_upgrade,upgrade_plan_code,purchase_url,release_notes FROM software_releases WHERE active=true AND platform='windows' AND channel='stable' ORDER BY created_at DESC LIMIT 1`);
  if(!q.rowCount||!isNewer(q.rows[0].version,currentVersion))return null;
  const release=q.rows[0];
  let upgradeOwned=false;
  if(release.paid_upgrade&&release.upgrade_plan_code){
    const owned=await db.query(`SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code=$2 AND ce.status='active' LIMIT 1`,[companyId,release.upgrade_plan_code]);
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
export async function migrateDeviceLicense(db=pool){
  await db.query(`
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
export function createDeviceLicenseHandler(db=pool){return async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!['/api/v1/license/device/activate','/api/v1/license/device/status','/api/v1/license/device/check','/api/v1/devices/activate'].includes(url.pathname))return false;
 try{
  const statusRequest=url.pathname.endsWith('/status');
  if(req.method!==(statusRequest?'GET':'POST')){sendJson(res,405,{error:'Methode nicht erlaubt'});return true}
  const user=await currentUser(db,req);
  if(!user){sendJson(res,401,{error:'Nicht angemeldet'});return true}
  if(url.pathname.endsWith('/activate')&&!['owner','admin'].includes(user.role)){sendJson(res,403,{error:'Nur die Betriebsverwaltung darf Geräte aktivieren'});return true}
  const entitlement=await activeDownloadEntitlement(db,user.company_id);
  if(!entitlement){sendJson(res,402,{active:false,error:'Keine aktive Download-Lizenz vorhanden.',purchaseRequired:true});return true}
  if(statusRequest){
   const deviceKey=deviceKeyValue(url.searchParams.get('deviceKey')||'');
   const device=(await db.query(`SELECT id,name,platform,app_version,status,activation_status,activated_at,last_seen_at,last_license_check_at,license_valid_until FROM devices WHERE company_id=$1 AND device_key=$2 AND entitlement_id=$3 LIMIT 1`,[user.company_id,deviceKey,entitlement.id])).rows[0]||null;
   sendJson(res,200,{active:!!device&&device.status==='active'&&device.activation_status==='active',device,entitlementId:entitlement.id});return true;
  }
  const b=await body(req),deviceKey=deviceKeyValue(typeof b.deviceKey==='string'?b.deviceKey.trim():b.deviceKey),appVersion=typeof b.appVersion==='string'?b.appVersion.trim().slice(0,40):'';
  const validUntil=leaseUntil();let result;
  if(url.pathname.endsWith('/activate')){
   const device=await activateLicensedDevice(db,user,entitlement.id,{deviceKey,name:typeof b.name==='string'?b.name.slice(0,120):'Windows POS',platform:typeof b.platform==='string'?b.platform.slice(0,40):'windows',appVersion},validUntil);
   result={active:true,device};
  }else result=await renewLicensedDevice(db,user,entitlement.id,deviceKey,appVersion,validUntil);
  if(!result.active){sendJson(res,409,result);return true}
  // Update discovery is independent from permission to keep using an already
  // licensed device. A release-catalog failure must not revoke that permission.
  let update=null;try{update=await updateForDevice(db,user.company_id,appVersion)}catch{}
  sendJson(res,200,{...result,...(url.pathname==='/api/v1/devices/activate'?{licensed:true}:{}),validUntil:validUntil.toISOString(),checkIntervalMinutes:360,update,entitlementId:entitlement.id,deviceLimit:1});return true;
 }catch(error){sendJson(res,error.status||503,{active:false,error:error.status?error.message:'Gerätefreigabe momentan nicht verfügbar',...(error.deviceLimitReached?{deviceLimitReached:true}:{}),...(error.activeDevice?{activeDevice:error.activeDevice}:{}),...(error.status===402?{purchaseRequired:true}:{})});return true}
}}
export const handleDeviceLicense=createDeviceLicenseHandler(pool);

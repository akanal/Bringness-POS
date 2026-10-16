import crypto from 'node:crypto';

const fail=(message,status=400,detail={})=>{throw Object.assign(Error(message),{status,...detail})};
export function deviceKeyValue(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(value))fail('Ungültige Geräte-ID');
 return value;
}
async function licenseAuthority(c,user,entitlementId,activation){
 if(!(await c.query(`SELECT id FROM users WHERE id=$1 AND company_id=$2 AND status='active'
  AND NOT coalesce(must_change_password,false) AND ($3::boolean=false OR role IN ('owner','admin')) FOR SHARE`,[user.id,user.company_id,activation])).rowCount)fail('Keine aktuelle Freigabe für diese Geräteaktion',403);
 if(!(await c.query(`SELECT ce.id FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id
  WHERE ce.id=$1 AND ce.company_id=$2 AND ce.status='active' AND bp.code='download_license'
  FOR ${activation?'UPDATE':'SHARE'} OF ce`,[entitlementId,user.company_id])).rowCount)fail('Keine aktive Download-Lizenz vorhanden.',402);
}
export async function activateLicensedDevice(db,user,entitlementId,details,validUntil){
 const deviceKey=deviceKeyValue(details.deviceKey),c=await db.connect();
 try{
  await c.query('BEGIN');await licenseAuthority(c,user,entitlementId,true);
  const bound=(await c.query("SELECT id,device_key,name FROM devices WHERE entitlement_id=$1 AND activation_status='active' AND status='active' LIMIT 1",[entitlementId])).rows[0];
  if(bound&&bound.device_key!==deviceKey)fail('Diese Download-Lizenz ist bereits auf einem anderen Gerät aktiviert.',409,{deviceLimitReached:true,activeDevice:{id:bound.id,name:bound.name}});
  const previous=(await c.query('SELECT company_id FROM devices WHERE device_key=$1 FOR UPDATE',[deviceKey])).rows[0];
  if(previous&&previous.company_id!==user.company_id)fail('Dieses Gerät gehört zu einem anderen Betrieb. Gerätezuordnung zuerst durch die Verwaltung klären.',403);
  const device=(await c.query(`INSERT INTO devices(company_id,device_key,name,platform,app_version,status,last_seen_at,entitlement_id,activation_status,activated_at,deactivated_at,last_license_check_at,license_valid_until)
   VALUES($1,$2,$3,$4,$5,'active',now(),$6,'active',now(),NULL,now(),$7)
   ON CONFLICT(device_key) DO UPDATE SET name=EXCLUDED.name,platform=EXCLUDED.platform,app_version=EXCLUDED.app_version,status='active',last_seen_at=now(),entitlement_id=EXCLUDED.entitlement_id,activation_status='active',activated_at=COALESCE(devices.activated_at,now()),deactivated_at=NULL,last_license_check_at=now(),license_valid_until=EXCLUDED.license_valid_until
   WHERE devices.company_id=EXCLUDED.company_id
   RETURNING id,name,platform,app_version,activation_status,activated_at,license_valid_until`,[user.company_id,deviceKey,details.name,details.platform,details.appVersion,entitlementId,validUntil])).rows[0];
  if(!device)fail('Gerätezuordnung inzwischen geändert. Verwaltung kontaktieren.',403);
  await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'download_device_activated','device',$3,$4)",[user.company_id,user.id,device.id,JSON.stringify({entitlementId,deviceKeyHash:crypto.createHash('sha256').update(deviceKey).digest('hex')})]);
  await c.query('COMMIT');return device;
 }catch(error){await c.query('ROLLBACK');if(error.code==='23505')fail('Diese Download-Lizenz ist bereits auf einem anderen Gerät aktiviert.',409,{deviceLimitReached:true});throw error}finally{c.release()}
}
export async function renewLicensedDevice(db,user,entitlementId,deviceKey,appVersion,validUntil){
 deviceKeyValue(deviceKey);const c=await db.connect();
 try{
  await c.query('BEGIN');await licenseAuthority(c,user,entitlementId,false);
  const device=(await c.query(`UPDATE devices SET app_version=$4,last_seen_at=now(),last_license_check_at=now(),license_valid_until=$5
   WHERE company_id=$1 AND device_key=$2 AND entitlement_id=$3 AND status='active' AND activation_status='active'
   RETURNING id,name,platform,app_version,activation_status,activated_at,last_seen_at,license_valid_until`,[user.company_id,deviceKey,entitlementId,appVersion,validUntil])).rows[0];
  await c.query('COMMIT');
  return device?{active:true,device}:{active:false,device:null,error:'Dieses Gerät ist für die Download-Lizenz nicht aktiviert.'};
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}

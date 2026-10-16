import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDeviceLicenseHandler,migrateDeviceLicense} from '../device-license.js';

const db=new PGlite(),id=()=>crypto.randomUUID(),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
try{
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,email text,display_name text,role text,status text,must_change_password boolean DEFAULT false);
  CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
  CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text);
  CREATE TABLE company_entitlements(id uuid PRIMARY KEY,company_id uuid,plan_id uuid,status text,purchased_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
  CREATE TABLE devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,device_key text UNIQUE,name text,platform text,app_version text,status text,last_seen_at timestamptz,entitlement_id uuid);
  CREATE TABLE software_releases(id uuid PRIMARY KEY,version text,active boolean,platform text,channel text,created_at timestamptz DEFAULT now());
  CREATE TABLE audit_log(company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id uuid,payload jsonb);`);
 const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query,connect:async()=>({query,release(){}})};
 await migrateDeviceLicense(pool);await migrateDeviceLicense(pool);
 const company=id(),other=id(),owner=id(),staff=id(),otherOwner=id(),plan=id(),entitlement=id(),otherEntitlement=id();
 await query("INSERT INTO users(id,company_id,email,display_name,role,status) VALUES($1,$2,'owner@example.test','Owner','owner','active'),($3,$2,'staff@example.test','Staff','cashier','active'),($4,$5,'other@example.test','Other','owner','active')",[owner,company,staff,otherOwner,other]);
 for(const [user,token] of [[owner,'owner'],[staff,'staff'],[otherOwner,'other']])await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[user,hash(token)]);
 await query("INSERT INTO billing_plans VALUES($1,'download_license')",[plan]);
 await query("INSERT INTO company_entitlements(id,company_id,plan_id,status) VALUES($1,$2,$3,'active'),($4,$5,$3,'active')",[entitlement,company,plan,otherEntitlement,other]);
 const handler=createDeviceLicenseHandler(pool),key='a'.repeat(64),otherKey='b'.repeat(64);
 async function http(path,token='owner',data={deviceKey:key,appVersion:'0.2.2'},handle=handler){
  let status,body;const req={url:path.startsWith('/')?path:'/api/v1/license/device/'+path,method:path.startsWith('status')?'GET':'POST',headers:{authorization:'Bearer '+token},async *[Symbol.asyncIterator](){yield JSON.stringify(data)}};
  await handle(req,{writeHead(code){status=code},end(raw){body=JSON.parse(raw)}});return {status,body};
 }
 assert.equal((await http('activate','staff')).status,403);
 assert.equal((await http('/api/v1/devices/activate','staff')).status,403);
 assert.equal((await http('activate')).status,200);
 assert.equal((await http('check','staff')).body.active,true);
 assert.equal((await http('status?deviceKey='+key,'staff')).body.active,true);
 const limit=await http('activate','owner',{deviceKey:'c'.repeat(64)});
 assert.equal(limit.status,409);assert.equal(limit.body.deviceLimitReached,true);
 assert.equal((await http('activate','other')).status,403);
 assert.equal((await query('SELECT company_id FROM devices WHERE device_key=$1',[key])).rows[0].company_id,company);
 const failingAudit={query,connect:async()=>({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('audit unavailable');return query(sql,args)},release(){}})};
 assert.equal((await http('activate','other',{deviceKey:otherKey},createDeviceLicenseHandler(failingAudit))).status,503);
 assert.equal((await query('SELECT 1 FROM devices WHERE device_key=$1',[otherKey])).rowCount,0);
 assert.equal((await http('activate','other',{deviceKey:otherKey})).status,200);
 await query("UPDATE devices SET status='disabled',license_valid_until=now()-interval '1 day' WHERE device_key=$1",[key]);
 assert.equal((await http('check','staff')).status,409);
 assert.equal((await http('status?deviceKey='+key,'staff')).body.active,false);
 assert.equal((await query('SELECT license_valid_until<now() expired FROM devices WHERE device_key=$1',[key])).rows[0].expired,true);
 await query("UPDATE devices SET status='active' WHERE device_key=$1",[key]);
 await query('UPDATE users SET must_change_password=true WHERE id=$1',[owner]);
 assert.equal((await http('activate')).status,401);assert.equal((await http('check')).status,401);
 await query('UPDATE users SET must_change_password=false WHERE id=$1',[owner]);
 const unavailableUpdates={query:async(sql,args)=>{if(sql.includes('FROM software_releases'))throw Error('release catalog unavailable');return query(sql,args)},connect:pool.connect};
 const renewed=await http('check','staff',{deviceKey:key},createDeviceLicenseHandler(unavailableUpdates));
 assert.equal(renewed.status,200);assert.equal(renewed.body.active,true);assert.equal(renewed.body.update,null);
 await query("UPDATE company_entitlements SET status='cancelled' WHERE id=$1",[entitlement]);
 assert.equal((await http('check','staff')).status,402);
 assert.equal((await http('activate','other',{deviceKey:[otherKey]})).status,400);
 assert.equal((await query("SELECT count(*) n FROM audit_log WHERE event_type='download_device_activated'")).rows[0].n,2);
 console.log('Device licensing passed: owner activation, staff renewal, one-device limit, tenant ownership, atomic audit, disabled devices, password gate, entitlement revocation and independent update discovery.');
}finally{await db.close();}

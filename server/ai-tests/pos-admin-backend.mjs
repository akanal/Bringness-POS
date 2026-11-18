import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {createPosAdminOverview} from '../pos-admin-overview.js';
import {createAdminAuditExport} from '../admin-audit-export.js';

let db,cleanup;
const connectionString=process.env.POS_ADMIN_TEST_DATABASE_URL;
if(connectionString){
 const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
 const schema='pos_admin_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=10000'});
 cleanup=async()=>{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();};
}else{
 const lite=new PGlite();await lite.waitReady;
 const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await lite.exec(sql);return {rows:[],rowCount:0};}const r=await lite.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};};
 db={query,connect:async()=>({query,release(){}})};cleanup=()=>lite.close();
}
const id=()=>crypto.randomUUID(),hash=t=>crypto.createHash('sha256').update(t).digest('hex');
try{
 await db.query(`CREATE TABLE companies(id uuid PRIMARY KEY,name text,created_at timestamptz DEFAULT now());
 CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,email text,role text,status text,must_change_password boolean DEFAULT false,created_at timestamptz DEFAULT now());
 CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid,expires_at timestamptz);
 CREATE TABLE platform_admins(user_id uuid PRIMARY KEY,active boolean);
 CREATE TABLE company_features(company_id uuid,feature_code text,status text,payment_status text,ends_at timestamptz,grace_until timestamptz);
 CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text,name text,amount_cents int,currency text);
 CREATE TABLE billing_transactions(id uuid PRIMARY KEY,company_id uuid,plan_id uuid,status text,amount_cents int,created_at timestamptz DEFAULT now());
 CREATE TABLE audit_log(id bigserial PRIMARY KEY,company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id text,created_at timestamptz DEFAULT now());`);
 const co=id(),other=id(),owner=id(),normal=id(),plan=id();
 await db.query("INSERT INTO companies(id,name) VALUES($1,'Fixture company'),($2,'Other company')",[co,other]);
 await db.query("INSERT INTO companies(id,name,created_at) SELECT md5('company-'||i)::uuid,'Historical '||i,'2020-01-01' FROM generate_series(1,251) i");
 await db.query("INSERT INTO restaurants VALUES($1,$2),($3,$4)",[id(),co,id(),other]);
 for(const [uid,cid,token] of [[owner,co,'platform'],[normal,other,'normal']]){
  await db.query("INSERT INTO users(id,company_id,email,role,status) VALUES($1,$2,$3,'owner','active')",[uid,cid,token+'@example.test']);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(token),uid]);
 }
 await db.query('INSERT INTO platform_admins VALUES($1,true)',[owner]);
 await db.query("INSERT INTO company_features(company_id,feature_code,status) VALUES($1,'pos_base','active'),($1,'table_qr','inactive'),($2,'pos_base','active')",[co,other]);
 await db.query("INSERT INTO billing_plans VALUES($1,'pos_base_monthly','Base',3499,'EUR'),($2,'unrelated_plan','Unrelated',1,'EUR')",[plan,id()]);
 await db.query("INSERT INTO billing_transactions SELECT md5('payment-'||i)::uuid,$1,$2,'paid',3499,'2026-01-01T00:00:00Z'::timestamptz+i*interval '1 second' FROM generate_series(1,1001) i",[co,plan]);
 await db.query("INSERT INTO billing_transactions VALUES($1,$2,$3,'pending',3499,'2026-02-01')",[id(),other,plan]);
 await db.query("INSERT INTO audit_log(company_id,actor_user_id,event_type) VALUES($1,$2,'own.event'),($3,$2,'foreign.event')",[co,owner,other]);
 const overview=createPosAdminOverview(db),audit=createAdminAuditExport(db);
 async function call(handler,path,{token='platform',method='GET'}={}){
  let status,headers,body;const handled=await handler(Object.assign(Readable.from([]),{url:path,method,headers:token?{authorization:'Bearer '+token}:{}}),{writeHead(s,h){status=s;headers=h;},end(b){body=b;}});
  return {handled,status,headers,body,data:headers?.['content-type']?.startsWith('application/json')?JSON.parse(body):null};
 }
 const path='/api/v1/platform/control/overview';
 assert.equal((await call(overview,'/api/v1/platform/overview')).handled,false,'legacy numeric contract must remain separate');
 assert.equal((await call(overview,path,{token:''})).status,401);
 assert.equal((await call(overview,path,{token:'normal'})).status,403);
 assert.equal((await call(overview,path,{method:'POST'})).status,405);
 assert.equal((await call(overview,path+'?companyId='+other)).status,400);
 const result=await call(overview,path);assert.equal(result.status,200);assert.equal(result.headers['cache-control'],'no-store');
 assert.deepEqual(result.data.summary,{companies:253,restaurants:2,activeFeatures:2,payments:1002});
 assert.equal(result.data.companies.length,250);assert.equal(result.data.limited,true);assert.equal(result.data.plans.length,1);
 const customer=result.data.companies.find(c=>c.id===co);assert.equal(customer.restaurant_count,1);assert.equal(customer.payments.length,1);assert.equal(new Date(customer.payments[0].createdAt).toISOString(),'2026-01-01T00:16:41.000Z');
 assert.equal(customer.features.length,2);assert.equal(customer.owner_email,'platform@example.test');
 const exported=await call(audit,'/api/v1/admin/audit/export');assert.equal(exported.status,200);assert(exported.body.includes('own.event'));assert(!exported.body.includes('foreign.event'));
 for(const [sql,args,restore,restoreArgs] of [
  ["UPDATE users SET status='blocked' WHERE id=$1",[owner],"UPDATE users SET status='active' WHERE id=$1",[owner]],
  ['UPDATE users SET must_change_password=true WHERE id=$1',[owner],'UPDATE users SET must_change_password=false WHERE id=$1',[owner]],
  ["UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[owner],"UPDATE sessions SET expires_at=now()+interval '1 hour' WHERE user_id=$1",[owner]],
  ['UPDATE platform_admins SET active=false',[], 'UPDATE platform_admins SET active=true',[]]
 ]){await db.query(sql,args);assert.equal((await call(overview,path)).status,403);if(!sql.includes('platform_admins'))assert.equal((await call(audit,'/api/v1/admin/audit/export')).status,403);await db.query(restore,restoreArgs);}
 // If revocation already holds the authority row, the waiting request must read
 // its committed state rather than using an earlier permission lookup.
 if(connectionString){
  const blocker=await db.connect();await blocker.query('BEGIN');await blocker.query('UPDATE platform_admins SET active=false WHERE user_id=$1',[owner]);
  let arrived;const waiting=new Promise(r=>arrived=r);
  const locked={connect:async()=>{const c=await db.connect();return {query:(sql,args)=>{if(sql.includes('FOR SHARE OF s,u,pa'))arrived();return c.query(sql,args);},release:()=>c.release()};}};
  const pending=call(createPosAdminOverview(locked),path);await waiting;await blocker.query('COMMIT');blocker.release();assert.equal((await pending).status,403);
  await db.query('UPDATE platform_admins SET active=true');
  const blocker2=await db.connect();await blocker2.query('BEGIN');await blocker2.query('DELETE FROM sessions WHERE user_id=$1',[owner]);
  let auditArrived;const auditWaiting=new Promise(r=>auditArrived=r);
  const auditPool={connect:async()=>{const c=await db.connect();return {query:(sql,args)=>{if(sql.includes('FOR SHARE OF s,u'))auditArrived();return c.query(sql,args);},release:()=>c.release()};}};
  const pendingAudit=call(createAdminAuditExport(auditPool),'/api/v1/admin/audit/export');await auditWaiting;await blocker2.query('COMMIT');blocker2.release();assert.equal((await pendingAudit).status,403);
 }
 assert.equal(Number((await db.query('SELECT count(*) n FROM audit_log')).rows[0].n),2,'read-only endpoints do not write audit or business data');
 const start=await readFile(new URL('../start.js',import.meta.url),'utf8');assert(start.indexOf('await handlePosAdminOverview(req,res)')<start.indexOf('await handlePlatformControl(req,res)'));
 const legacy=await readFile(new URL('../index.js',import.meta.url),'utf8');assert.equal((legacy.match(/if\(p==="\/api\/v1\/platform\/overview"/g)||[]).length,1);
 console.log('POS admin backend passed: distinct numeric/customer contracts, complete totals beyond 250 customers, bounded latest payments, current authority, tenant-scoped audit and no business writes'+(connectionString?', including concurrent revocation/logout on PostgreSQL16.':'.'));
}finally{await cleanup();}

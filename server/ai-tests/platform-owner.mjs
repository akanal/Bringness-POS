import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {migratePlatformOwner,bootstrapPlatformOwner} from '../platform-owner.js';
import {systemActor} from '../system-access.js';
const url=process.env.PLATFORM_OWNER_TEST_DATABASE_URL;
let db,pool,close;
if(url){
 const {default:pg}=await import('pg');
 const admin=new pg.Pool({connectionString:url});
 const schema='owner_test_'+crypto.randomBytes(8).toString('hex');
 await admin.query('CREATE SCHEMA '+schema);
 pool=new pg.Pool({connectionString:url,options:'-c search_path='+schema+',public'});
 db=pool;
 close=async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()};
}else{
 const {PGlite}=await import('@electric-sql/pglite');const engine=new PGlite();
 const query=(sql,args)=>args?engine.query(sql,args):engine.exec(sql).then(results=>results.at(-1)||{rows:[]});
 db={query};pool={query,connect:async()=>({query,release(){}})};
 close=()=>engine.close();
}
const owner=crypto.randomUUID(),other=crypto.randomUUID(),company=crypto.randomUUID();
const token='synthetic-owner',hash=crypto.createHash('sha256').update(token).digest('hex');
const schema=`CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false,email text);
CREATE TABLE platform_admins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,active boolean NOT NULL DEFAULT true);
CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid,expires_at timestamptz);
CREATE TABLE audit_log(company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id text);`;
const ownerUser={id:owner,company_id:company};
try{
 await db.query(schema);
 await db.query("INSERT INTO users(id,company_id,role,status,email) VALUES($1,$3,'owner','active','owner@test.invalid'),($2,$3,'admin','active','licence@test.invalid')",[owner,other,company]);
 await db.query('INSERT INTO platform_admins(user_id) VALUES($1)',[owner]);
 await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",[hash,owner,crypto.createHash('sha256').update('other').digest('hex'),other]);
 await migratePlatformOwner(pool);
 assert.equal((await db.query('SELECT user_id FROM platform_owner')).rows[0].user_id,owner);
 await migratePlatformOwner(pool); // restart does not rebind or change the timestamp
 const req=t=>({headers:{authorization:'Bearer '+t}}),res=()=>({writeHead(code){this.status=code},end(){}});
 assert.equal((await systemActor(pool,req(token),res())).id,owner);
 let denied=res();assert.equal(await systemActor(pool,req('other'),denied),null);assert.equal(denied.status,403);
 for(const role of ['owner','admin','licensee']){
  await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,other]);
  await assert.rejects(db.query('INSERT INTO platform_admins(user_id) VALUES($1)',[other]),/bound platform owner/);
 }
 await assert.rejects(db.query('UPDATE platform_owner SET user_id=$1',[other]),/protected operational recovery/);
 await assert.rejects(db.query('DELETE FROM platform_owner'),/protected operational recovery/);
 await assert.rejects(db.query('TRUNCATE platform_owner'),/protected operational recovery/);
 await assert.rejects(db.query('DELETE FROM users WHERE id=$1',[owner]),/foreign key constraint/);
 await db.query("UPDATE users SET email='changed@test.invalid' WHERE id=$1",[owner]);
 assert.equal((await systemActor(pool,req(token),res())).id,owner);
 await db.query('UPDATE platform_admins SET active=false WHERE user_id=$1',[owner]);
 denied=res();assert.equal(await systemActor(pool,req(token),denied),null);assert.equal(denied.status,403);
 assert.equal(await bootstrapPlatformOwner(pool,{id:other,company_id:company}),false);
 await assert.rejects(db.query('INSERT INTO platform_admins(user_id) VALUES($1)',[other]),/bound platform owner/);
 await db.query('UPDATE platform_admins SET active=true WHERE user_id=$1',[owner]);
 assert.equal((await systemActor(pool,req(token),res())).id,owner);
 await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[owner]);
 denied=res();assert.equal(await systemActor(pool,req(token),denied),null);assert.equal(denied.status,403);
 // A fresh isolated installation: only authenticated bootstrap may create the first grant.
 await db.query('DROP TABLE platform_owner CASCADE');
 await db.query('DROP TABLE platform_admins');
 await db.query('CREATE TABLE platform_admins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES users(id),active boolean NOT NULL DEFAULT true)');
 await migratePlatformOwner(pool);
 if(url){
  const claimed=await Promise.all([bootstrapPlatformOwner(pool,ownerUser),bootstrapPlatformOwner(pool,{id:other,company_id:company})]);
  assert.equal(claimed.filter(Boolean).length,1);
 }else{
  assert.equal(await bootstrapPlatformOwner(pool,ownerUser),true);
  assert.equal(await bootstrapPlatformOwner(pool,{id:other,company_id:company}),false);
 }
 assert.equal((await db.query('SELECT count(*)::int n FROM platform_owner')).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM platform_admins WHERE active=true')).rows[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM audit_log WHERE event_type='platform.owner.bound'")).rows[0].n,1);
 // Ambiguous legacy grants must stop safely, without picking the first/email-matched user.
 await db.query('DROP TABLE platform_owner CASCADE');await db.query('DROP TABLE platform_admins');
 await db.query('CREATE TABLE platform_admins(user_id uuid PRIMARY KEY,active boolean NOT NULL)');
 await db.query('INSERT INTO platform_admins VALUES($1,true),($2,true)',[owner,other]);
 await assert.rejects(migratePlatformOwner(pool),/PLATFORM_OWNER_AMBIGUOUS/);
 assert.equal((await db.query('SELECT count(*)::int n FROM platform_admins WHERE active=true')).rows[0].n,2);
 assert.equal((await db.query("SELECT to_regclass('platform_owner') AS relation")).rows[0].relation,null);
 console.log('Single platform owner passed: immutable migration, roles denied, no rebootstrap, expiry/revocation, recovery guard, atomic first binding and ambiguous rollback'+(url?', concurrent PostgreSQL bootstrap':''));
}finally{await close()}

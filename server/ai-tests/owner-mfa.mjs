import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Readable} from 'node:stream';
import {migratePlatformOwner} from '../platform-owner.js';import {migrateOwnerMfa} from '../owner-mfa-schema.js';
import {createOwnerMfa,ownerLoginChallenge} from '../owner-mfa.js';import {issueLoginSession} from '../login-session.js';
import {digest,totp} from '../owner-mfa-crypto.js';import {systemActor} from '../system-access.js';
const url=process.env.MFA_TEST_DATABASE_URL;let pool,db,close;
if(url){const {default:pg}=await import('pg');const admin=new pg.Pool({connectionString:url}),schema='mfa_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:url,options:'-c search_path='+schema+',public'});db=pool;close=async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()}}else{const {PGlite}=await import('@electric-sql/pglite');const engine=new PGlite(),query=(sql,args)=>args?engine.query(sql,args):engine.exec(sql).then(rs=>rs.at(-1)||{rows:[]});db={query};pool={query,connect:async()=>({query,release(){}})};close=()=>engine.close()}
const owner=crypto.randomUUID(),other=crypto.randomUUID(),company=crypto.randomUUID(),password='synthetic-password',credential=digest(password);let clock=Date.now();
const handler=createOwnerMfa(pool,{keyMaterial:'synthetic-private-encryption-material',passwordHash:async p=>digest(p),now:()=>clock});
async function call(action,input,token){const req=Readable.from(input?[JSON.stringify(input)]:[]);Object.assign(req,{url:'/api/v1/platform/security/'+action,method:input?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})}});const res={writeHead(status,headers){this.status=status;assert.equal(headers['cache-control'],'no-store')},end(body){this.data=JSON.parse(body)}};assert.equal(await handler(req,res),true);return res}
const login=()=>issueLoginSession(pool,{userId:owner,passwordHash:credential,role:'owner',beforeIssue:ownerLoginChallenge});
const code=secret=>totp(secret,Math.floor(clock/30000));const next=()=>{clock+=31000};
async function allowed(token){const res={writeHead(s){this.status=s},end(){}};return await systemActor(pool,{headers:{authorization:'Bearer '+token}},res)}
async function resetAttempts(){await db.query("UPDATE platform_owner_mfa SET failed_count=0,failure_window=now()-interval '16 minutes'")}
try{
 await db.query(`CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,password_hash text,must_change_password boolean DEFAULT false);
 CREATE TABLE platform_admins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,active boolean NOT NULL DEFAULT true);
 CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id),expires_at timestamptz NOT NULL);
 CREATE TABLE audit_log(company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id text);`);
 await db.query("INSERT INTO users(id,company_id,role,status,password_hash) VALUES($1,$3,'owner','active',$4),($2,$3,'admin','active',$4)",[owner,other,company,credential]);await db.query('INSERT INTO platform_admins(user_id) VALUES($1)',[owner]);await migratePlatformOwner(pool);await migrateOwnerMfa(pool);await migrateOwnerMfa(pool);
 const initial=await login(),old=await login();assert.equal(typeof initial,'string');assert.equal((await allowed(initial)).id,owner);
 const regular=await issueLoginSession(pool,{userId:other,passwordHash:credential,beforeIssue:ownerLoginChallenge});assert.equal((await call('status',null,regular)).status,403);assert.equal((await call('status')).status,401);
 assert.equal((await call('status',null,initial)).data.enabled,false);
 assert.equal((await call('begin',{password:'wrong'},initial)).status,400);
 const begun=await call('begin',{password},initial);assert.equal(begun.status,200);assert.equal(begun.data.recoveryCodes.length,10);assert.match(begun.data.qr,/^data:image\/png;base64,/);const secret=begun.data.secret,backup=begun.data.recoveryCodes;
 const s=(await db.query('SELECT * FROM platform_owner_mfa')).rows[0];assert(!s.pending_cipher.includes(secret));assert(!JSON.stringify(s).includes(backup[0]));assert(!JSON.stringify((await call('status',null,initial)).data).includes(secret));
 assert.equal((await call('activate',{password,enrollment:begun.data.enrollment,code:code(secret),saved:false},initial)).status,400);
 assert.equal((await call('activate',{password,enrollment:begun.data.enrollment,code:code(secret),saved:true},old)).status,409);
 assert.equal((await call('activate',{password,enrollment:begun.data.enrollment,code:code(secret)==='000000'?'111111':'000000',saved:true},initial)).status,400);assert((await allowed(old)));
 assert.equal((await call('activate',{password,enrollment:begun.data.enrollment,code:code(secret),saved:true},initial)).data.enabled,true);assert.equal(await allowed(old),null);assert((await allowed(initial)));assert.equal((await call('status',null,initial)).data.recoveryRemaining,10);
 await assert.rejects(db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[digest('raw-bypass'),owner]),/second factor required/);
 await assert.rejects(db.query("UPDATE sessions SET expires_at=now()+interval '30 days' WHERE token_hash=$1",[digest(initial)]),/second factor required/);
 const pending=await login();assert.equal(pending.mfaRequired,true);assert.equal(await allowed(pending.challenge),null);assert.equal((await call('verify-login',{challenge:pending.challenge,code:code(secret)})).status,400); // activation code replay
 next();let verified=await call('verify-login',{challenge:pending.challenge,code:code(secret)});assert.equal(verified.status,200);assert((await allowed(verified.data.token)));assert.equal((await call('verify-login',{challenge:pending.challenge,code:code(secret)})).status,401);
 const recovery=await login();verified=await call('verify-login',{challenge:recovery.challenge,code:backup[0]});assert.equal(verified.status,200);const recovered=verified.data.token;assert.equal((await call('status',null,recovered)).data.recoveryRemaining,9);
 const used=await login();assert.equal((await call('verify-login',{challenge:used.challenge,code:backup[0]})).status,400);
 const expired=await login();await db.query("UPDATE platform_mfa_challenges SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[digest(expired.challenge)]);assert.equal((await call('verify-login',{challenge:expired.challenge,code:backup[1]})).status,401);
 const changed=await login();await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[digest('changed'),owner]);assert.equal((await call('verify-login',{challenge:changed.challenge,code:backup[1]})).status,401);await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[credential,owner]);
 const suspended=await login();await db.query("UPDATE users SET status='blocked' WHERE id=$1",[owner]);assert.equal((await call('verify-login',{challenge:suspended.challenge,code:backup[1]})).status,401);await db.query("UPDATE users SET status='active' WHERE id=$1",[owner]);
 await resetAttempts();for(let i=0;i<10;i++){const p=await login();assert.equal((await call('verify-login',{challenge:p.challenge,code:'not-a-code'})).status,400)}const throttled=await login();assert.equal((await call('verify-login',{challenge:throttled.challenge,code:backup[1]})).status,429);await resetAttempts();
 if(url){
  const a=await login(),b=await login();const attempts=await Promise.all([a,b].map(p=>call('verify-login',{challenge:p.challenge,code:backup[1]})));assert.deepEqual(attempts.map(x=>x.status).sort(),[200,400]);
  next();const c=await login(),d=await login();const otp=await Promise.all([c,d].map(p=>call('verify-login',{challenge:p.challenge,code:code(secret)})));assert.deepEqual(otp.map(x=>x.status).sort(),[200,400]);
  // A raw legacy insert that started before activation must recheck AFTER the account lock.
  await db.query('UPDATE platform_owner_mfa SET enabled=false');const lock=await pool.connect(),inserter=await pool.connect();
  try{await lock.query('BEGIN');await lock.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner]);await lock.query('UPDATE platform_owner_mfa SET enabled=true');const pid=(await inserter.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const attempt=inserter.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[digest('racing-bypass'),owner]).then(()=>null,e=>e);let waiting=false;
   for(let i=0;i<100;i++){const row=(await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];if(row?.wait_event_type==='Lock'){waiting=true;break}await new Promise(r=>setTimeout(r,10))}assert(waiting,'raw insert must wait for the owner account lock');await lock.query('COMMIT');assert.match((await attempt)?.message||'',/second factor required/);
  }finally{await lock.query('ROLLBACK');lock.release();inserter.release()}
 }
 // A recently used last recovery code can still recover the authenticator without a second unused code.
 assert.equal((await call('disable',{password:'wrong',code:backup[2],confirm:true},recovered)).status,400);
 assert.equal((await call('disable',{password,confirm:false},recovered)).status,400);
 assert.equal((await call('disable',{password,confirm:true},recovered)).data.enabled,false);assert.equal(await allowed(initial),null);assert((await allowed(recovered)));assert.equal(typeof await login(),'string');
 assert.equal((await db.query("SELECT count(*)::int n FROM audit_log WHERE event_type='platform.mfa.enabled'")).rows[0].n,1);
 console.log('Owner MFA passed: staged password-confirmed QR setup, encrypted seed, saved one-time recovery codes, atomic activation/revocation, no password-only sessions, expiry/password/suspension guards, persistent throttling, single-use OTP/recovery, lost-device recovery'+(url?', concurrent PostgreSQL consume and legacy insertion barrier':''));
}finally{await close()}

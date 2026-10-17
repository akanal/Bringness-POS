import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {issueLoginSession} from '../login-session.js';
const connectionString=process.env.SESSION_TEST_DATABASE_URL;if(!connectionString)throw Error('Dedicated PostgreSQL session test database required');
const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
const schema='sessions_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
const db=new pg.Pool({connectionString,max:3,application_name:schema+'_login',options:'-c search_path='+schema+' -c statement_timeout=5000'});
const control=new pg.Pool({connectionString,max:2,application_name:schema+'_change',options:'-c search_path='+schema+' -c statement_timeout=5000'});
let held,releaseGate,pending;
const waitForLock=async app=>{for(let i=0;i<200;i++){if((await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[app])).rowCount)return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Expected concurrent account lock was not observed');};
try{
 await db.query(`CREATE TABLE users(id uuid PRIMARY KEY,status text,password_hash text,role text);CREATE TABLE ai_accounts(LIKE users INCLUDING ALL);
 CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id),expires_at timestamptz);
 CREATE TABLE ai_sessions(token_hash text PRIMARY KEY,account_id uuid REFERENCES ai_accounts(id),expires_at timestamptz);`);
 for(const kind of ['pos','ai']){
  const table=kind==='pos'?'users':'ai_accounts',sessions=kind==='pos'?'sessions':'ai_sessions',key=kind==='pos'?'user_id':'account_id',userId=crypto.randomUUID();
  await db.query('INSERT INTO '+table+" VALUES($1,'active','old','owner')",[userId]);
  const count=async()=>Number((await db.query('SELECT count(*) n FROM '+sessions+' WHERE '+key+'=$1',[userId])).rows[0].n);
  const initial=await issueLoginSession(db,{kind,userId,passwordHash:'old',role:'owner'});assert.match(initial,/^[a-f0-9]{64}$/);assert.equal(await count(),1);
  // Reset takes the account lock first. A login with already verified old
  // credentials must wait and refuse to create any new session after commit.
  held=await control.connect();await held.query('BEGIN');await held.query('UPDATE '+table+" SET password_hash='new' WHERE id=$1",[userId]);
  pending=issueLoginSession(db,{kind,userId,passwordHash:'old',role:'owner'});pending.catch(()=>{});await waitForLock(schema+'_login');
  await held.query('DELETE FROM '+sessions+' WHERE '+key+'=$1',[userId]);await held.query('COMMIT');held.release();held=null;
  assert.equal(await pending,null);pending=null;assert.equal(await count(),0);
  // Login takes the lock first. Reset waits; once login commits, deletion
  // includes that just-created session. No old session survives either order.
  let reached;const beforeInsert=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{releaseGate=resolve;});
  const guarded={connect:async()=>{const c=await db.connect();return {query:async(sql,args)=>{if(sql.startsWith('INSERT INTO ')){reached();await gate;}return c.query(sql,args);},release:()=>c.release()};}};
  pending=issueLoginSession(guarded,{kind,userId,passwordHash:'new',role:'owner'});pending.catch(()=>{});await beforeInsert;
  held=await control.connect();await held.query('BEGIN');const changing=held.query('UPDATE '+table+" SET password_hash='newer' WHERE id=$1",[userId]);changing.catch(()=>{});
  await waitForLock(schema+'_change');releaseGate();assert.match(await pending,/^[a-f0-9]{64}$/);pending=null;await changing;
  await held.query('DELETE FROM '+sessions+' WHERE '+key+'=$1',[userId]);await held.query('COMMIT');held.release();held=null;assert.equal(await count(),0);
  held=await control.connect();await held.query('BEGIN');await held.query('UPDATE '+table+" SET status='disabled' WHERE id=$1",[userId]);
  pending=issueLoginSession(db,{kind,userId,passwordHash:'newer',role:'owner'});pending.catch(()=>{});await waitForLock(schema+'_login');await held.query('COMMIT');held.release();held=null;assert.equal(await pending,null);pending=null;assert.equal(await count(),0);
 }
 console.log('PostgreSQL 16 POS/AI session races passed: reset-first, login-first, suspension and no surviving stale-credential session.');
}finally{
 releaseGate?.();if(held){await held.query('ROLLBACK').catch(()=>{});held.release();}if(pending)await Promise.allSettled([pending]);
 await Promise.all([db.end(),control.end()]);await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();
}

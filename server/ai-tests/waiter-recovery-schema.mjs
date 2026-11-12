import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {createWaiterWorkflow,migrateWaiterWorkflow} from '../waiter-workflow.js';
import {legacyPasswordHash,saltedSecretHash,secretMatches} from '../secret-derivation.js';

// Use the actual foundation, including UUID foreign keys and text audit entities.
// A simplified UUID audit fixture concealed the production 42P08 reset failure.
const connectionString=process.env.WAITER_RECOVERY_TEST_DATABASE_URL;
const schema='recovery_'+crypto.randomBytes(8).toString('hex');
let admin,db;
if(connectionString){
 const url=new URL(connectionString);
 assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test','Disposable loopback test database required');
 admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString,max:4,options:'-c search_path='+schema+',public -c statement_timeout=5000'});
}else{db=new PGlite();await db.waitReady;}
const query=async(sql,args)=>{
 if(args===undefined&&sql.includes(';')){await (connectionString?db.query(sql):db.exec(sql));return {rows:[],rowCount:0};}
 const result=await db.query(sql,args);return {...result,rowCount:result.rowCount??result.affectedRows??result.rows.length};
};
let failAudit=false;
const clientQuery=c=>async(sql,args)=>{
 if(failAudit&&sql.startsWith('INSERT INTO audit_log')){failAudit=false;throw Object.assign(Error('Synthetic audit failure'),{code:'TEST_AUDIT_FAILURE'});}
 return c.query(sql,args);
};
const pool={query,connect:async()=>{
 const c=connectionString?await db.connect():{query,release(){}};
 return {query:clientQuery(c),release:()=>c.release()};
}};
const handler=createWaiterWorkflow(pool),id=()=>crypto.randomUUID(),digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function request(body){
 const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{url:'/api/v1/staff/reset',method:'POST',headers:{}});
 let status,result;assert(await handler(req,{writeHead(code,headers){status=code;assert.equal(headers['cache-control'],'no-store');},end(raw){result=JSON.parse(raw);}}));
 return {status,...result};
}
try{
 let foundation=fs.readFileSync(new URL('../../db/schema.sql',import.meta.url),'utf8');
 if(!connectionString)foundation=foundation.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
 await query(foundation);
 await query(`ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'owner',ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
 ALTER TABLE employees ADD COLUMN user_id uuid REFERENCES users(id),ADD COLUMN duty_state text DEFAULT 'off';
 CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id),expires_at timestamptz NOT NULL);`);
 await migrateWaiterWorkflow(pool);await migrateWaiterWorkflow(pool);
 const company=id(),restaurant=id(),user=id(),employee=id(),owner=id();
 await query("INSERT INTO companies(id,name) VALUES($1,'Synthetic recovery company')",[company]);
 await query("INSERT INTO restaurants(id,company_id,name,mode) VALUES($1,$2,'Synthetic recovery restaurant','restaurant')",[restaurant,company]);
 await query("INSERT INTO users(id,company_id,email,password_hash,display_name,role) VALUES($1,$2,'waiter@example.test',$3,'Synthetic waiter','waiter'),($4,$2,'owner@example.test',$3,'Synthetic owner','owner')",[user,company,await legacyPasswordHash('OldPass1!'),owner]);
 await query("INSERT INTO employees(id,restaurant_id,display_name,role,user_id,pin_hash) VALUES($1,$2,'Synthetic waiter','waiter',$3,$4)",[employee,restaurant,user,await saltedSecretHash('1234')]);
 const token=async(kind,{userId=user,expires="now()+interval '30 minutes'",used='NULL'}={})=>{
  const raw=crypto.randomBytes(32).toString('hex');await query(`INSERT INTO waiter_recovery(token_hash,user_id,kind,expires_at,used_at) VALUES($1,$2,$3,${expires},${used})`,[digest(raw),userId,kind]);return raw;
 };
 const session=async()=>query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[digest(crypto.randomBytes(32).toString('hex')),user]);
 const count=async table=>Number((await query('SELECT count(*) n FROM '+table)).rows[0].n);
 const valid=await token('password');
 assert.equal((await request({token:valid,inspect:true})).kind,'password');
 for(const body of [{token:'bad',inspect:true},{token:valid,value:'NewPass2!',confirm:'OtherPass2!'},{token:valid,value:'weak',confirm:'weak'}])assert.equal((await request(body)).status,400);
 for(const blocked of [await token('password',{expires:"now()-interval '1 second'"}),await token('password',{used:'now()'}),await token('password',{userId:owner})])assert.equal((await request({token:blocked,inspect:true})).status,400);
 await query('UPDATE employees SET active=false WHERE id=$1',[employee]);assert.equal((await request({token:valid,inspect:true})).status,400);
 await query('UPDATE employees SET active=true WHERE id=$1',[employee]);
 await query("UPDATE users SET status='disabled' WHERE id=$1",[user]);assert.equal((await request({token:valid,inspect:true})).status,400);
 await query("UPDATE users SET status='active' WHERE id=$1",[user]);
 assert.equal(await count('audit_log'),0);
 // An audit write failure must roll back the credential, session deletion and
 // link consumption together; the identical original link must remain usable.
 for(const kind of ['pin','password']){
  const raw=await token(kind),value=kind==='pin'?'5678':'NewPass2!';await session();
  const beforeUser=(await query('SELECT password_hash FROM users WHERE id=$1',[user])).rows[0].password_hash;
  const beforePin=(await query('SELECT pin_hash FROM employees WHERE id=$1',[employee])).rows[0].pin_hash;
  failAudit=true;await assert.rejects(request({token:raw,value,confirm:value}),{code:'TEST_AUDIT_FAILURE'});
  assert.equal((await query('SELECT password_hash FROM users WHERE id=$1',[user])).rows[0].password_hash,beforeUser);
  assert.equal((await query('SELECT pin_hash FROM employees WHERE id=$1',[employee])).rows[0].pin_hash,beforePin);
  assert.equal((await query('SELECT used_at FROM waiter_recovery WHERE token_hash=$1',[digest(raw)])).rows[0].used_at,null);
  assert.equal(await count('sessions'),kind==='pin'?1:2);assert.equal(await count('audit_log'),kind==='pin'?0:1);
  assert.equal((await request({token:raw,value,confirm:value})).status,200);
  assert.equal((await request({token:raw,value,confirm:value})).status,400);
  assert.equal(await count('sessions'),kind==='pin'?1:0);
  const audit=(await query("SELECT * FROM audit_log WHERE event_type='waiter.recovery' AND payload->>'kind'=$1",[kind])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].company_id,company);assert.equal(audit[0].actor_user_id,user);assert.equal(audit[0].entity_id,user);assert(audit[0].created_at);
  if(kind==='pin')assert(await secretMatches(value,(await query('SELECT pin_hash FROM employees WHERE id=$1',[employee])).rows[0].pin_hash));
  else assert(await secretMatches(value,(await query('SELECT password_hash FROM users WHERE id=$1',[user])).rows[0].password_hash));
 }
 if(connectionString){
  const raw=await token('password');await session();
  const outcomes=await Promise.all([request({token:raw,value:'NextPass3!',confirm:'NextPass3!'}),request({token:raw,value:'NextPass3!',confirm:'NextPass3!'})]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,400]);assert.equal(await count('audit_log'),3);assert.equal(await count('sessions'),0);
 }
 console.log('Waiter recovery on '+(connectionString?'PostgreSQL 16':'PGlite')+' passed: actual foundation schema, audit foreign keys/text identity, invalid/expired/used/disabled links, distinct PIN/password, atomic audit-failure rollback, identical retry, session revocation'+(connectionString?', competing single-use resets':'')+'.');
}finally{
 if(connectionString){await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}else await db.close();
}

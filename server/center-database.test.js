import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {createCenterHandler} from './center-core.js';
const dependency=process.env.CENTER_TEST_PGLITE || '@electric-sql/pglite';
const engine=await import(process.env.CENTER_TEST_DATABASE_URL ? (process.env.CENTER_TEST_PG || 'pg') : dependency);
test('database migration and delegated setup lifecycle',async()=>{
 const db=process.env.CENTER_TEST_DATABASE_URL ? new engine.default.Pool({connectionString:process.env.CENTER_TEST_DATABASE_URL}) : new engine.PGlite();
 if(process.env.CENTER_TEST_DATABASE_URL){db.exec=sql=>db.query(sql);db.close=()=>db.end();}
 try {
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY); CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
 CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
 CREATE TABLE platform_admins(user_id uuid,active boolean);`);
 const source=await readFile(new URL('./center.js',import.meta.url),'utf8');
 const migration=source.match(/await pool.query\(`([\s\S]*?)`\)/)[1];
 await db.exec(migration);await db.exec(migration);
 const company=crypto.randomUUID(),admin=crypto.randomUUID(),owner=crypto.randomUUID(),restaurant=crypto.randomUUID();
 await db.query('INSERT INTO companies VALUES($1)',[company]);
 await db.query("INSERT INTO users(id,company_id,role,status) VALUES($1,$3,'owner','active'),($2,$3,'owner','active')",[admin,owner,company]);
 await db.query('INSERT INTO platform_admins VALUES($1,true)',[admin]);
 for(const [id,key] of [[admin,'admin'],[owner,'owner']])await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[id,crypto.createHash('sha256').update(key).digest('hex')]);
 await db.query('INSERT INTO restaurants VALUES($1,$2,$3)',[restaurant,company,'Restaurant']);
 const handler=createCenterHandler({query:async(sql,args)=>{const q=await db.query(sql,args);return {...q,rowCount:q.rows.length || q.affectedRows || 0};}});
 async function call(path,method,key,payload){const req=Readable.from(payload?[JSON.stringify(payload)]:[]);Object.assign(req,{url:'/api/v1/centers'+path,method,headers:{authorization:'Bearer '+key}});const res={writeHead(status){this.status=status;},end(raw){this.data=JSON.parse(raw);}};await handler(req,res);return res;}
 const created=await call('','POST','admin',{name:'Center'});assert.equal(created.status,201);const c='/'+created.data.center.id;
 assert.equal((await call(c+'/restaurants','PUT','admin',{restaurantId:restaurant,active:true})).status,200);
 assert.equal((await call(c+'/tables','POST','owner',{name:'Before approval'})).status,403);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'approve',userId:owner,restaurantId:restaurant})).status,403);
 assert.equal((await call(c+'/setup','PUT','admin',{action:'approve',userId:owner,restaurantId:restaurant})).status,200);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'complete'})).status,409);
 assert.equal((await call(c+'/tables','POST','owner',{name:'Table 1'})).status,201);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'complete'})).status,200);
 assert.equal((await call(c+'/tables','POST','owner',{name:'After lock'})).status,403);
 assert.equal((await call(c+'/setup','PUT','admin',{action:'approve',userId:owner,restaurantId:restaurant})).status,409);
 assert.equal((await call(c+'/tables','POST','admin',{name:'Admin maintenance'})).status,201);
 assert.equal((await call(c+'/tables','GET','owner')).data.tables.length,2);
 }finally{await db.close();}
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {createCanvas} from '@napi-rs/canvas';
import {createProductPhotos} from '../product-photos.js';
let db,cleanup;
const connectionString=process.env.PRODUCT_PHOTO_TEST_DATABASE_URL;
if(connectionString){
 const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
 const schema='photo_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=10000'});
 cleanup=async()=>{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();};
}else{
 const lite=new PGlite();await lite.waitReady;const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await lite.exec(sql);return {rows:[],rowCount:0};}const r=await lite.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};};
 db={query,connect:async()=>({query,release(){}})};cleanup=()=>lite.close();
}
const uuid=()=>crypto.randomUUID(),hash=v=>crypto.createHash('sha256').update(v||'').digest('hex');
try{
 await db.query(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
 CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid,expires_at timestamptz);
 CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,image_url text,name text,price_cents int,tax_rate numeric);
 CREATE TABLE audit_log(company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id text,payload jsonb);`);
 const company=uuid(),other=uuid(),rid=uuid(),second=uuid(),foreign=uuid(),product=uuid(),foreignProduct=uuid(),owner=uuid(),waiter=uuid();
 await db.query('INSERT INTO companies VALUES($1),($2)',[company,other]);await db.query('INSERT INTO restaurants VALUES($1,$2),($3,$2),($4,$5)',[rid,company,second,foreign,other]);
 for(const [id,role,token] of [[owner,'owner','owner'],[waiter,'waiter','waiter']]){await db.query("INSERT INTO users(id,company_id,role,status) VALUES($1,$2,$3,'active')",[id,company,role]);await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(token),id]);}
 await db.query("INSERT INTO products VALUES($1,$2,'🍽️','Unchanged article',1299,7),($3,$4,NULL,'Foreign',999,19)",[product,rid,foreignProduct,foreign]);
 const canvas=createCanvas(4,3),ctx=canvas.getContext('2d');ctx.fillStyle='#ff7628';ctx.fillRect(0,0,4,3);const image=canvas.toDataURL('image/png');ctx.fillStyle='#071a2b';ctx.fillRect(0,0,4,3);const alternative=canvas.toDataURL('image/png');
 const handler=createProductPhotos(db);
 async function call({id=product,restaurant=rid,token='owner',method='GET',body}={},handle=handler){
  let status,data,headers;const req=Object.assign(Readable.from(body?[JSON.stringify(body)]:[]),{url:'/api/v1/products/'+id+'/image'+(method==='GET'?'?restaurantId='+restaurant:''),method,headers:token?{authorization:'Bearer '+token}:{}});
  assert(await handle(req,{writeHead(s,h){status=s;headers=h;},end(s){data=JSON.parse(s);}}));assert.equal(headers['cache-control'],'no-store');return {status,...data};
 }
 assert.equal((await call({token:''})).status,401);assert.equal((await call({token:'waiter'})).status,403);assert.equal((await call({id:foreignProduct})).status,404);assert.equal((await call({restaurant:second})).status,404);
 await db.query("UPDATE users SET role='admin' WHERE id=$1",[owner]);assert.equal((await call()).status,200);await db.query("UPDATE users SET role='owner' WHERE id=$1",[owner]);
 const initial=await call();assert.equal(initial.image,'🍽️');assert.equal(initial.version,hash('🍽️'));
 const b={restaurantId:rid,expectedVersion:initial.version,image};assert.equal((await call({method:'PUT',body:b})).status,200);
 assert.equal((await call()).image,image,'image persists across an independent read');assert.equal((await call({method:'PUT',body:b})).image,image,'same-body retry after lost reply is safe');
 assert.equal(Number((await db.query('SELECT count(*) n FROM audit_log')).rows[0].n),1,'retry does not create another change');
 assert.equal((await call({method:'PUT',body:{...b,image:alternative}})).status,409,'old version cannot overwrite another image');
 for(const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk','https://external.test/image.png','data:image/png;base64,'+'A'.repeat(200001)])assert([400,413].includes((await call({method:'PUT',body:{...b,image:bad}})).status));
 assert.equal((await call({method:'PUT',body:{...b,restaurantId:second}})).status,404);
 assert.equal((await call({method:'PUT',body:{...b,price_cents:1}})).status,400);
 let latest=await call();assert.equal((await call({method:'PUT',body:{restaurantId:rid,expectedVersion:latest.version,image:null}})).status,200);assert.equal((await call()).image,null);
 const unchanged=(await db.query('SELECT name,price_cents,tax_rate FROM products WHERE id=$1',[product])).rows[0];assert.equal(unchanged.name,'Unchanged article');assert.equal(unchanged.price_cents,1299);assert.equal(Number(unchanged.tax_rate),7);
 for(const [change,restore] of [["UPDATE users SET must_change_password=true WHERE id=$1","UPDATE users SET must_change_password=false WHERE id=$1"],["UPDATE users SET status='blocked' WHERE id=$1","UPDATE users SET status='active' WHERE id=$1"],["UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1","UPDATE sessions SET expires_at=now()+interval '1 hour' WHERE user_id=$1"]]){await db.query(change,[owner]);assert.equal((await call()).status,403);await db.query(restore,[owner]);}
 if(connectionString){
  latest=await call();const results=await Promise.all([image,alternative].map(value=>call({method:'PUT',body:{restaurantId:rid,expectedVersion:latest.version,image:value}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=results.find(r=>r.status===200);assert.equal((await call()).image,winner.image);
  const blocker=await db.connect();await blocker.query('BEGIN');await blocker.query("UPDATE users SET status='blocked' WHERE id=$1",[owner]);let arrive;const arrived=new Promise(r=>arrive=r);
  const waiting={connect:async()=>{const c=await db.connect();return {query:(sql,args)=>{if(sql.includes('FOR SHARE OF s,u'))arrive();return c.query(sql,args);},release:()=>c.release()};}};
  const pending=call({},createProductPhotos(waiting));await arrived;await blocker.query('COMMIT');blocker.release();assert.equal((await pending).status,403);
 }
 console.log('Article photos SQL passed: own-restaurant owner/admin scope, stored image/readback/removal, unchanged prices, safe replay, stale-image conflict, invalid format/size refusal and current authority'+(connectionString?', including concurrent changes and account blocking on PostgreSQL16.':'.'));
}finally{await cleanup();}

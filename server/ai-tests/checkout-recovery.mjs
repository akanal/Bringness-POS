import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {createPaymentCheckout,migratePaymentCheckout} from '../payment-checkout.js';
const uuid=()=>crypto.randomUUID(),postgresUrl=process.env.CHECKOUT_TEST_DATABASE_URL;
let db,adminDb,schema;
if(postgresUrl){
 const url=new URL(postgresUrl);assert(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
 schema='checkout_'+crypto.randomBytes(8).toString('hex');adminDb=new pg.Pool({connectionString:postgresUrl});await adminDb.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString:postgresUrl,options:'-c search_path='+schema});db.exec=sql=>db.query(sql);db.close=()=>db.end();
}else{db=new PGlite();await db.waitReady;}
const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};};
let failRecord=false,revokeAfterRead=false;
const pool={query:async(sql,args)=>{const result=await query(sql,args);if(revokeAfterRead&&sql.includes('FROM sessions')&&!sql.includes('FOR SHARE')){revokeAfterRead=false;await query("UPDATE users SET role='waiter' WHERE id=$1",[owner]);}return result;},connect:async()=>{
 const client=postgresUrl?await db.connect():{query,release(){}};
 return {query:async(sql,args)=>{if(failRecord&&sql.startsWith('INSERT INTO pos_checkout_requests'))throw Error('simulated request ledger failure');return client.query(sql,args);},release:()=>client.release()};
}};
await db.exec((await fs.readFile(new URL('../../db/schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
await db.exec(`ALTER TABLE users ADD COLUMN role text DEFAULT 'owner';ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
 CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);CREATE SEQUENCE receipt_number_seq;
 ALTER TABLE receipts ADD COLUMN merchant_snapshot jsonb;
 CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);`);
await migratePaymentCheckout(pool);await migratePaymentCheckout(pool);
const company=uuid(),restaurant=uuid(),owner=uuid(),product=uuid(),token='synthetic-checkout-session';
await query("INSERT INTO companies(id,name) VALUES($1,'Fixture')",[company]);
await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Register')",[restaurant,company]);
await query("INSERT INTO users(id,company_id,email,password_hash,display_name) VALUES($1,$2,'owner@example.test','fixture','Owner')",[owner,company]);
await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[crypto.createHash('sha256').update(token).digest('hex'),owner]);
await query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,'Coffee',895,19)",[product,restaurant]);
const handler=createPaymentCheckout(pool);let loseReply=false;
const server=http.createServer(async(req,res)=>{try{if(loseReply){loseReply=false;await handler(req,{writeHead(){},end(){} });res.destroy();}else await handler(req,res);}catch{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'temporary fixture failure'}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/api/v1/orders/checkout';
const pay=async(body,auth=token)=>{const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
const request={requestKey:uuid(),restaurantId:restaurant,items:[{productId:product,qty:1}],payments:[{method:'cash',amountCents:895}]};
const count=async table=>Number((await query('SELECT count(*) n FROM '+table)).rows[0].n);
try{
 const missing={...request};delete missing.requestKey;assert.equal((await pay(missing)).status,400);assert.equal(await count('orders'),0);
 loseReply=true;await assert.rejects(pay(request));assert.equal(await count('orders'),1);assert.equal(await count('payments'),1);assert.equal(await count('receipts'),1);
 // Retrying a historical successful sale must not depend on a changed price/catalog.
 await query('UPDATE products SET price_cents=1200,active=false WHERE id=$1',[product]);
 const replay=await pay(request);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.totalCents,895);assert.equal(await count('orders'),1);
 const conflict=await pay({...request,items:[{productId:product,qty:2}],payments:[{method:'cash',amountCents:1790}]});assert.equal(conflict.status,409);assert.equal(await count('payments'),1);
 assert.equal((await pay(request,'expired')).status,401);
 await query('UPDATE users SET must_change_password=true WHERE id=$1',[owner]);assert.equal((await pay(request)).status,401);await query('UPDATE users SET must_change_password=false WHERE id=$1',[owner]);
 revokeAfterRead=true;assert.equal((await pay({...request,requestKey:uuid()})).status,403);await query("UPDATE users SET role='owner' WHERE id=$1",[owner]);
 const otherCompany=uuid();await query("INSERT INTO companies(id,name) VALUES($1,'Other')",[otherCompany]);await query('UPDATE users SET company_id=$1 WHERE id=$2',[otherCompany,owner]);assert.equal((await pay(request)).status,403);await query('UPDATE users SET company_id=$1 WHERE id=$2',[company,owner]);
 await query('UPDATE products SET price_cents=895,active=true WHERE id=$1',[product]);
 const next={...request,requestKey:uuid()};failRecord=true;assert.equal((await pay(next)).status,503);assert.equal(await count('orders'),1);assert.equal(await count('receipts'),1);assert.equal(await count('payments'),1);failRecord=false;
 const created=await pay(next);assert.equal(created.status,201);assert.equal((await pay(next)).body.id,created.body.id);assert.equal(await count('orders'),2);
 if(postgresUrl){const concurrent={...request,requestKey:uuid()};const results=await Promise.all(Array.from({length:5},()=>pay(concurrent)));assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===200).length,4);assert.equal(new Set(results.map(r=>r.body.id)).size,1);assert.equal(await count('orders'),3);}
 assert.equal(Number((await query("SELECT count(*) n FROM receipts WHERE fiscal_status<>'pending'")).rows[0].n),0);
 console.log('Checkout recovery passed: lost HTTP reply, immutable replay despite catalog change, key conflict, revoked session/role/tenant, atomic ledger rollback'+(postgresUrl?', five concurrent requests create exactly one sale':'')+' and honest pending fiscal status.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();if(adminDb){await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}}

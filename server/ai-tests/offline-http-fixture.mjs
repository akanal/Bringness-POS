// Actual offline HTTP handler and PostgreSQL engine; no mocked SQL or receipt responses.
import http from 'node:http';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {handleOfflineSales,migrateOfflineSales} from '../offline-sales.js';
import {migratePosStockBridge} from '../pos-stock-bridge-core.js';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export async function createOfflineHttpFixture(){
 const db=new PGlite();await db.waitReady;
 const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query,connect:async()=>({query,release(){}})};
 await db.exec((await readFile(new URL('../../db/schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 await db.exec(`ALTER TABLE users ADD COLUMN role text DEFAULT 'owner';ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
 CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);
 CREATE TABLE company_features(company_id uuid NOT NULL REFERENCES companies(id),feature_code text NOT NULL,status text NOT NULL,ends_at timestamptz,grace_until timestamptz);
 ALTER TABLE receipts ADD COLUMN merchant_snapshot jsonb;
 CREATE TABLE devices(id uuid PRIMARY KEY,company_id uuid,device_key text,status text,activation_status text,license_valid_until timestamptz,entitlement_id uuid);
 CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text);CREATE TABLE company_entitlements(id uuid PRIMARY KEY,company_id uuid,plan_id uuid,status text);
 CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);`);
 await migratePosStockBridge(pool);await migrateOfflineSales(pool);
 const id=()=>crypto.randomUUID(),company=id(),restaurant=id(),owner=id(),device=id(),product=id(),plan=id(),entitlement=id(),deviceKey='b'.repeat(64);
 await query("INSERT INTO companies(id,name) VALUES($1,'Electron isolated test')",[company]);
 await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Electron register')",[restaurant,company]);
 await query("INSERT INTO users(id,company_id,email,password_hash,display_name) VALUES($1,$2,'electron@example.test','fixture-only','Owner')",[owner,company]);
 await query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,'Electron test meal',895,19)",[product,restaurant]);
 await query("INSERT INTO billing_plans VALUES($1,'download_license')",[plan]);await query("INSERT INTO company_entitlements VALUES($1,$2,$3,'active')",[entitlement,company,plan]);
 await query("INSERT INTO devices VALUES($1,$2,$3,'active','active',now()+interval '7 days',$4)",[device,company,deviceKey,entitlement]);
 let mode='normal',failures=0,requests=0;
 const server=http.createServer(async(req,res)=>{
  requests++;
  if(mode==='unavailable'){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Isolated service unavailable"}');return;}
  const batch=req.url==='/api/v1/offline/batch';
  if(batch&&mode==='before'){failures++;req.socket.destroy();return;}
  const output=batch&&mode==='after'?{writeHead(){},end(){failures++;req.socket.destroy();}}:res;
  try{if(!await handleOfflineSales(req,output,{db:pool})){res.writeHead(404);res.end();}}
  catch{if(!res.destroyed){res.writeHead(500);res.end();}}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const issueSession=async()=>{const token=crypto.randomBytes(32).toString('hex');await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(token),owner]);return token;};
 return {base,deviceKey,company,restaurant,product,issueSession,
  setMode(value){if(!['normal','before','after','unavailable'].includes(value))throw Error('Invalid fixture fault');mode=value;},
  counters:()=>({requests,failures}),
  expire:token=>query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[hash(token)]),
  ownerRole:role=>query('UPDATE users SET role=$1 WHERE id=$2',[role,owner]),
  deviceEnabled:enabled=>query('UPDATE devices SET status=$1 WHERE id=$2',[enabled?'active':'disabled',device]),
  async counts(){return (await query(`SELECT (SELECT count(*)::int FROM orders) orders,(SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM payments) payments,(SELECT count(*)::int FROM pos_offline_sales) imports,(SELECT coalesce(sum(amount_cents),0)::int FROM payments) cash`)).rows[0];},
  async mappings(){return (await query('SELECT s.id,s.order_id,r.receipt_number FROM pos_offline_sales s JOIN receipts r ON r.order_id=s.order_id ORDER BY s.id')).rows;},
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
 };
}

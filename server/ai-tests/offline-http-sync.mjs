import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createOfflineLedger} from '../../apps/desktop/offline-ledger.mjs';
import {quoteOfflineSale,canonicalJson,offlineFingerprint} from '../offline-sale-core.js';
import {migrateOfflineSales,issueOfflineCatalog,handleOfflineSales} from '../offline-sales.js';
import {migratePosStockBridge} from '../pos-stock-bridge-core.js';
import {migrateAccountantAccess,accountantHandler} from '../accountant-access.js';
const uuid=()=>crypto.randomUUID(),company=uuid(),restaurant=uuid(),owner=uuid(),device=uuid(),product=uuid(),plan=uuid(),entitlement=uuid(),deviceKey='a'.repeat(64),user={id:owner,company_id:company,role:'owner'};
// Optional PostgreSQL 16 validation is restricted to the disposable local CI service.
import pg from 'pg';
const postgresUrl=process.env.OFFLINE_TEST_DATABASE_URL;
let adminDb=null,schema=null,db;
if(postgresUrl){
 const url=new URL(postgresUrl);
 assert(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/bringness_device_test','Only the local disposable CI database is allowed');
 schema='offline_http_'+crypto.randomBytes(8).toString('hex');
 adminDb=new pg.Pool({connectionString:postgresUrl});await adminDb.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString:postgresUrl,options:'-c search_path='+schema});
 db.exec=sql=>db.query(sql);db.close=()=>db.end();
}else{db=new PGlite();await db.waitReady;}
const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length}};
const pool={query,connect:async()=>postgresUrl?db.connect():({query,release(){}})};
await db.exec((await fs.readFile(new URL('../../db/schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
await db.exec(`ALTER TABLE users ADD COLUMN role text DEFAULT 'owner';ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);
ALTER TABLE receipts ADD COLUMN merchant_snapshot jsonb;
CREATE TABLE devices(id uuid PRIMARY KEY,company_id uuid,device_key text,status text,activation_status text,license_valid_until timestamptz,entitlement_id uuid);
CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text);CREATE TABLE company_entitlements(id uuid PRIMARY KEY,company_id uuid,plan_id uuid,status text);
CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);`);
await migratePosStockBridge(pool);await migrateOfflineSales(pool);await migrateAccountantAccess(pool);await migrateOfflineSales(pool);
await query("INSERT INTO companies(id,name) VALUES($1,'Testbetrieb')",[company]);await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Kasse')",[restaurant,company]);await query("INSERT INTO users(id,company_id,email,password_hash,display_name) VALUES($1,$2,'owner@example.test','test','Inhaber')",[owner,company]);await query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,'Burger',895,19)",[product,restaurant]);await query("INSERT INTO billing_plans VALUES($1,'download_license')",[plan]);await query("INSERT INTO company_entitlements VALUES($1,$2,$3,'active')",[entitlement,company,plan]);await query("INSERT INTO devices VALUES($1,$2,$3,'active','active',now()+interval '7 days',$4)",[device,company,deviceKey,entitlement]);
const snapshot=await issueOfflineCatalog(pool,user,deviceKey),sale={id:uuid(),snapshotId:snapshot.id,restaurantId:restaurant,createdAt:new Date().toISOString(),paymentMethod:'cash',items:[{productId:product,quantity:2}]};

import http from 'node:http';
import {createOfflineSync} from '../../apps/desktop/offline-sync.mjs';
const token='local-http-fixture';
await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[crypto.createHash('sha256').update(token).digest('hex'),owner]);
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bringness-http-sync-'));
let local=new PGlite(directory),ledger=await createOfflineLedger(local,quoteOfflineSale);
let fault=null,auth=token;
const server=http.createServer(async(req,res)=>{
 try{
  if(fault==='before'&&req.url.endsWith('/batch')){fault=null;res.destroy();return;}
  if(fault==='after'&&req.url.endsWith('/batch')){
   fault=null;
   // Execute the actual authenticated route and committed import, then drop its reply.
   await handleOfflineSales(req,{writeHead(){},end(){}},{db:pool});
   res.destroy();return;
  }
  await handleOfflineSales(req,res,{db:pool});
 }catch(error){res.destroy(error);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const connect=async()=>async(type,payload)=>{
 const response=await fetch(base+'/api/v1/offline/'+type,{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify({...payload,deviceKey})});
 const data=await response.json();if(!response.ok)throw Error(data.error);return data;
};
const counts=async()=>({orders:Number((await query('SELECT count(*) n FROM orders')).rows[0].n),receipts:Number((await query('SELECT count(*) n FROM receipts')).rows[0].n)});
try{
 await ledger.catalog(snapshot);await ledger.sale(sale);
 let sync=createOfflineSync({ledger,connect});
 fault='before';assert.equal((await sync.sync()).state,'error');
 assert.deepEqual(await counts(),{orders:0,receipts:0});assert.equal(await ledger.pendingCount(),1);
 fault='after';assert.equal((await sync.sync()).state,'error');
 assert.deepEqual(await counts(),{orders:1,receipts:1});assert.equal(await ledger.pendingCount(),1);
 await local.close();local=new PGlite(directory);ledger=await createOfflineLedger(local,quoteOfflineSale);
 sync=createOfflineSync({ledger,connect});
 assert.equal(await ledger.pendingCount(),1);assert.equal((await sync.sync()).state,'success');
 assert.deepEqual(await counts(),{orders:1,receipts:1});assert.equal(await ledger.pendingCount(),0);
 const second={...sale,id:uuid(),createdAt:new Date().toISOString()};await ledger.sale(second);
 auth='expired-token';assert.equal((await sync.sync()).state,'error');assert.equal(await ledger.pendingCount(),1);
 auth=token;await query("UPDATE users SET role='waiter' WHERE id=$1",[owner]);
 assert.equal((await sync.sync()).state,'error');assert.equal(await ledger.pendingCount(),1);
 await query("UPDATE users SET role='owner' WHERE id=$1",[owner]);
 assert.equal((await sync.sync()).state,'success');assert.equal(await ledger.pendingCount(),0);
 assert.deepEqual(await counts(),{orders:2,receipts:2});
 assert.equal(Number((await query('SELECT sum(amount_cents) n FROM payments')).rows[0].n),3580);
 assert.equal((await sync.sync(true)).state,'success');assert.deepEqual(await counts(),{orders:2,receipts:2});
 console.log('Offline HTTP integration passed: actual authenticated route, socket loss before/after commit, filesystem restart, 401/403 recovery, two sales and exactly two receipts. Electron UI, real cloud and fiscal hardware acceptance remain separate.');
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await local.close();await db.close();
 if(adminDb){await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}
 await fs.rm(directory,{recursive:true,force:true});
}

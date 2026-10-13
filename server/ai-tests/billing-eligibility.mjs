import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8').split('\n').find(line=>line.startsWith('if(p==="/api/v1/billing/checkout"'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const checkout=new AsyncFunction('p','req','res','auth','body','pool','json','hasRawFeature','process',source);
async function attempt(planCode,{base=false,restaurant=false,download=false}={}){
 let reply;const pool={query:async(sql,args)=>{
  if(sql.includes('FROM company_billing_profiles'))return {rows:[{company_name:'Restaurant',street:'Straße',postal_code:'12345',city:'Berlin',country:'Deutschland'}]};
  if(sql.includes('SELECT * FROM billing_plans'))return {rows:[{id:'plan',code:planCode,billing_type:planCode==='download_license'?'one_time':'monthly'}]};
  if(sql.includes("bp.code='download_license'"))return {rows:[],rowCount:download?1:0};
  if(sql.includes("bp.code='pos_base_monthly'"))return {rows:[],rowCount:base?1:0};
  if(sql.includes('FROM company_entitlements'))return {rows:[],rowCount:0};
  throw Error('Unexpected checkout query');
 }};
 await checkout('/api/v1/billing/checkout',{method:'POST'},{},async()=>({id:'owner',company_id:'company',role:'owner'}),async()=>({planCode}),pool,(_res,status,data)=>reply={status,...data},async(_company,code)=>code==='restaurant'?restaurant:code==='pos_base'?base:false,{env:{}});
 return reply;
}
assert.equal((await attempt('restaurant_monthly')).status,503); // Eligible; only payment provider missing.
assert.equal((await attempt('restaurant_monthly',{base:true})).status,409); // Existing base must be cancelled first.
assert.equal((await attempt('pos_base_monthly',{restaurant:true})).status,409);
assert.equal((await attempt('table_qr_monthly')).status,409);
assert.equal((await attempt('table_qr_monthly',{restaurant:true})).status,503);
for(const code of ['restaurant_monthly','pos_base_monthly'])assert.equal((await attempt(code,{download:true})).status,409);
assert.equal((await attempt('download_license',{base:true})).status,409);
assert.equal((await attempt('table_qr_monthly',{download:true})).status,503);
assert.equal((await attempt('table_qr_monthly',{base:true})).status,503);
// Exercise the actual guest order eligibility SQL: an expired restaurant must stop QR orders.
const moduleSource=fs.readFileSync(new URL('../restaurant-owner-features.js',import.meta.url),'utf8');
const sql=moduleSource.match(/const licensed=await c.query\("([^"]+)"/)[1];
const db=new PGlite();await db.waitReady;
await db.exec('CREATE TABLE billing_plans(id text,code text);CREATE TABLE company_entitlements(company_id text,plan_id text,status text)');
await db.exec('CREATE TABLE company_features(company_id text,feature_code text,status text,ends_at timestamptz,grace_until timestamptz)');
await db.exec("INSERT INTO company_features VALUES('company','table_qr','active',NULL,NULL)");
assert.equal((await db.query(sql,['company'])).rows.length,0);
await db.exec("INSERT INTO company_features VALUES('company','restaurant','active',NULL,NULL)");
assert.equal((await db.query(sql,['company'])).rows.length,1);
await db.exec("UPDATE company_features SET ends_at=now()-interval '1 day' WHERE feature_code='restaurant'");
assert.equal((await db.query(sql,['company'])).rows.length,0);
await db.exec("INSERT INTO billing_plans VALUES('download','download_license');INSERT INTO company_entitlements VALUES('company','download','active')");
assert.equal((await db.query(sql,['company'])).rows.length,1);
await db.exec("UPDATE company_entitlements SET status='canceled';INSERT INTO company_features VALUES('company','pos_base','active',NULL,NULL)");
assert.equal((await db.query(sql,['company'])).rows.length,1);
await db.exec("UPDATE company_features SET ends_at=now()-interval '1 day' WHERE feature_code='table_qr'");
assert.equal((await db.query(sql,['company'])).rows.length,0);
await db.close();console.log('Billing checkout passed: standalone restaurant, no duplicate base charges, QR dependency, download restrictions and expired restaurant blocks guest QR orders.');

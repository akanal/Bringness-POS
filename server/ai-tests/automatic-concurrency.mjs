import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {migrateAutoProcurement,runAutomaticProcurement,saveProcurementPolicy} from '../ai-auto-procurement.js';
import {cartTransaction} from '../ai-cart.js';
const connectionString=process.env.PROCUREMENT_TEST_DATABASE_URL;
if(!connectionString)throw Error('A dedicated disposable PostgreSQL test database is required');
const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
const schema='procurement_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString});
await admin.query('CREATE SCHEMA '+schema);
const options='-c search_path='+schema+' -c statement_timeout=5000';
const db=new pg.Pool({connectionString,options,max:1,connectionTimeoutMillis:1500});
const other=new pg.Pool({connectionString,options,max:1,connectionTimeoutMillis:1500});
const control=new pg.Pool({connectionString,options,max:2,connectionTimeoutMillis:1500});
const uuid=()=>crypto.randomUUID(),now=new Date(),clock=()=>now;
let gateRelease,activeRun;
try{
 // Use the application's actual base AI DDL rather than a mock order ledger.
 const source=await readFile(new URL('../ai-platform.js',import.meta.url),'utf8');
 const start=source.indexOf('CREATE TABLE IF NOT EXISTS ai_accounts('),end=source.indexOf('CREATE INDEX IF NOT EXISTS ai_audit_actor_id_idx',start);
 assert(start>=0&&end>start);await db.query(source.slice(start,end));
 await db.query("ALTER TABLE ai_products ADD COLUMN available boolean NOT NULL DEFAULT true;INSERT INTO ai_settings VALUES('collection','{\"requireMandate\":false}');UPDATE ai_settings SET value='{\"ordersEnabled\":true}' WHERE key='launch';");
 await migrateAutoProcurement(db);
 const supplier=uuid(),product=uuid();
 await db.query("INSERT INTO ai_accounts(id,email,password_hash,name,business_name,role,status,city,address,delivery_area,delivery_terms) VALUES($1,'supplier@example.test','fixture','Supplier','Supplier','dealer','active','Berlin','Test street','Berlin','Fixture terms')",[supplier]);
 await db.query("INSERT INTO ai_products(id,supplier_id,name,unit,pack_quantity,price_cents) VALUES($1,$2,'Flour','kg',5,900)",[product,supplier]);
 const createBuyer=async()=>{
  const id=uuid(),location=uuid(),stock=uuid();
  await db.query("INSERT INTO ai_accounts(id,email,password_hash,name,business_name,role,status,city,address) VALUES($1,$2,'fixture','Buyer','Buyer','restaurant','active','Berlin','Test street')",[id,id+'@example.test']);
  await db.query("INSERT INTO ai_locations(id,account_id,name,address) VALUES($1,$2,'Kitchen','Test street')",[location,id]);
  await db.query("INSERT INTO ai_stock(id,account_id,location_id,name,unit) VALUES($1,$2,$3,'Flour','kg')",[stock,id,location]);
  const user={id,role:'restaurant'};
  await saveProcurementPolicy(db,user,{enabled:true,confirmed:true,days:3,leadDays:1,maxDailyNetCents:10000,supplierIds:[supplier]});
  return {user,stock};
 };
 const draft=buyer=>async(user,_body,{db:scoped})=>{
  assert.equal(user.id,buyer.user.id);
  const {rows}=await scoped.query('SELECT count(*)::int n FROM ai_orders WHERE buyer_id=$1',[user.id]);
  return {complete:true,lines:rows[0].n?[]:[{stockId:buyer.stock,productId:product,packs:1}]};
 };
 const count=async buyer=>Number((await control.query('SELECT count(*) n FROM ai_orders WHERE buyer_id=$1',[buyer.user.id])).rows[0].n);
 const unlocked=async buyer=>{const c=await control.connect();try{
  assert.equal((await c.query('SELECT pg_try_advisory_lock(hashtext($1),hashtext($2)) locked',['bringness-ai-auto-procurement',buyer.user.id])).rows[0].locked,true);
  assert.equal((await c.query('SELECT pg_advisory_unlock(hashtext($1),hashtext($2)) unlocked',['bringness-ai-auto-procurement',buyer.user.id])).rows[0].unlocked,true);
 }finally{c.release();}};
 const one=await createBuyer();
 const first=await runAutomaticProcurement(one.user,{db,draft:draft(one),now,clock});assert.equal(first.state,'ordered');assert.equal(await count(one),1);await unlocked(one);
 const replay=await runAutomaticProcurement(one.user,{db:other,draft:draft(one),now,clock});assert.equal(replay.state,'ordered');assert.equal(replay.replayed,true);assert.equal(await count(one),1);
 // Two independent pool sessions contend for exactly the same restaurant lock.
 const two=await createBuyer();let entered;
 const inside=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{gateRelease=resolve;});let blockedOnce=false;
 const waitingDraft=async(...args)=>{if(!blockedOnce){blockedOnce=true;entered();await gate;}return draft(two)(...args);};
 const running=activeRun=runAutomaticProcurement(two.user,{db,draft:waitingDraft,now,clock});
 await inside;assert.deepEqual(await runAutomaticProcurement(two.user,{db:other,draft:draft(two),now,clock}),{state:'busy'});
 gateRelease();assert.equal((await running).state,'ordered');assert.equal(await count(two),1);await unlocked(two);
 // Revocation from another connection must win before the real cart commits.
 const three=await createBuyer();let revoked=false;
 const revokeDraft=async(...args)=>{if(!revoked){revoked=true;await saveProcurementPolicy(control,three.user,{enabled:false});}return draft(three)(...args);};
 const disabled=await runAutomaticProcurement(three.user,{db,draft:revokeDraft,now,clock});assert.equal(disabled.state,'blocked');assert.equal(await count(three),0);await unlocked(three);
 // Lost acknowledgement after a real committed checkout reports durable success.
 const four=await createBuyer();let calls=0;
 const lost=await runAutomaticProcurement(four.user,{db,draft:draft(four),now,clock,cart:async(...args)=>{
  const result=await cartTransaction(...args);if(args[3].checkout!==false){calls++;throw Error('simulated lost checkout acknowledgement');}return result;
 }});
 assert.equal(lost.state,'ordered');assert.equal(lost.replayed,true);assert.equal(await count(four),1);assert.equal(calls,1);await unlocked(four);
 const stable=await runAutomaticProcurement(four.user,{db:other,draft:draft(four),now,clock});assert.equal(stable.replayed,true);assert.equal(await count(four),1);
 assert.equal(Number((await control.query('SELECT count(*) n FROM ai_checkouts')).rows[0].n),3);
 assert.equal(Number((await control.query("SELECT count(*) n FROM ai_audit WHERE action='automatic_procurement_ordered'")).rows[0].n),3);
 console.log('PostgreSQL 16 automatic procurement passed: one-connection checkout, real competing session exclusion, revocation, lost acknowledgement, durable replay and released locks.');
}finally{
 gateRelease?.();if(activeRun)await Promise.allSettled([activeRun]);await Promise.all([db.end(),other.end(),control.end()]);await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();
}

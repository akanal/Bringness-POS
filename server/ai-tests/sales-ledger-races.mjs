// Disposable PostgreSQL only. PGlite cannot prove concurrent session behaviour.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {migrateStockLifecycle} from '../ai-stock-lifecycle.js';
const connectionString=process.env.STOCK_AUTH_TEST_DATABASE_URL;
if(!connectionString)throw Error('Dedicated PostgreSQL sales ledger test required');
const url=new URL(connectionString);
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
const schema='sales_ledger_'+crypto.randomBytes(8).toString('hex');
const admin=new pg.Pool({connectionString,connectionTimeoutMillis:2000});
await admin.query('CREATE SCHEMA '+schema);
const options='-c search_path='+schema+' -c statement_timeout=10000';
const db=new pg.Pool({connectionString,options,max:4,connectionTimeoutMillis:2000});
const control=new pg.Pool({connectionString,options,max:2,connectionTimeoutMillis:2000});
let blocker;const runs=[];
// Only the pool import is injected; the real sales transaction and migrations run unchanged.
globalThis.salesLedgerRacePool=db;
try{
const source=await readFile(new URL('../ai-recipes.js',import.meta.url),'utf8');
const injected=source.replace("import {aiPool,platformPool} from './ai-database.js';",'const aiPool=()=>globalThis.salesLedgerRacePool,platformPool=globalThis.salesLedgerRacePool;');
assert.notEqual(injected,source);
const absolute=injected.replace(/from (['"])(\.\/[^'"]+\.js)\1/g,(_,q,path)=>'from '+JSON.stringify(new URL('../'+path.slice(2),import.meta.url).href));
const {migrateAiRecipes,ingestSale}=await import('data:text/javascript;base64,'+Buffer.from(absolute).toString('base64'));
const run=(...args)=>{const promise=ingestSale(...args);promise.catch(()=>{});runs.push(promise);return promise;};
const waitBlocked=async()=>{
 for(let i=0;i<300;i++){
  const blocked=await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%ai_accounts%' AND $1::int=ANY(pg_blocking_pids(pid))",[blocker.processID]);
  if(blocked.rowCount)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('Expected sales transaction account lock wait was not observed');
};
 const platform=await readFile(new URL('../ai-platform.js',import.meta.url),'utf8');
 const start=platform.indexOf('CREATE TABLE IF NOT EXISTS ai_accounts('),end=platform.indexOf('CREATE INDEX IF NOT EXISTS ai_audit_actor_id_idx',start);
 assert(start>=0&&end>start);await db.query(platform.slice(start,end));
 await migrateAiRecipes();await migrateStockLifecycle(db);
 const account=crypto.randomUUID(),location=crypto.randomUUID(),stock=crypto.randomUUID(),recipe=crypto.randomUUID(),connectorId=crypto.randomUUID();
 await db.query("INSERT INTO ai_accounts(id,email,password_hash,name,business_name,role,status) VALUES($1,'sales-race@example.test','fixture','Fixture','Fixture','restaurant','active')",[account]);
 await db.query("INSERT INTO ai_locations(id,account_id,name) VALUES($1,$2,'Race fixture')",[location,account]);
 await db.query("INSERT INTO ai_stock(id,account_id,location_id,name,unit,quantity) VALUES($1,$2,$3,'Ingredient','kg',10)",[stock,account,location]);
 await db.query("INSERT INTO ai_recipes(id,account_id,location_id,name,external_code) VALUES($1,$2,$3,'Dish','dish')",[recipe,account,location]);
 await db.query('INSERT INTO ai_recipe_items VALUES($1,$2,0.1)',[recipe,stock]);
 await db.query("INSERT INTO ai_connectors(id,account_id,location_id,name,kind,active) VALUES($1,$2,$3,'Race API','api',true)",[connectorId,account,location]);
 const binding=(await db.query('SELECT * FROM ai_connectors WHERE id=$1',[connectorId])).rows[0];
 const sale=eventId=>({eventId,items:[{productCode:'dish',quantity:1}]});
 const balance=async()=>Number((await control.query('SELECT quantity FROM ai_stock WHERE id=$1',[stock])).rows[0].quantity);
 const events=async()=>Number((await control.query('SELECT count(*)::int n FROM ai_sale_events')).rows[0].n);
 const moves=async()=>Number((await control.query('SELECT count(*)::int n FROM ai_stock_moves')).rows[0].n);
 blocker=await control.connect();
 // Observe both real sessions waiting on the same account, then let them race.
 await blocker.query('BEGIN');await blocker.query('SELECT id FROM ai_accounts WHERE id=$1 FOR UPDATE',[account]);
 const first=run(binding,sale('same-sale')),retry=run(binding,sale('same-sale'));
 await waitBlocked();await blocker.query('COMMIT');
 const same=await Promise.all([first,retry]);assert.equal(same.filter(r=>r.duplicate).length,1);
 assert.equal(await balance(),9.9);assert.equal(await events(),1);assert.equal(await moves(),1);
 // Distinct sales serialize without lost updates.
 await Promise.all([run(binding,sale('sale-two')),run(binding,sale('sale-three'))]);
 assert.equal(await balance(),9.7);assert.equal(await events(),3);assert.equal(await moves(),3);
 // Different reversal IDs cannot return the same original consumption twice.
 const reversals=await Promise.allSettled(['reverse-a','reverse-b'].map(eventId=>run(binding,{eventId,type:'reversal',reversesEventId:'same-sale'})));
 assert.equal(reversals.filter(r=>r.status==='fulfilled').length,1);
 const denied=reversals.find(r=>r.status==='rejected');assert.equal(denied.reason.status,409);
 assert.equal(await balance(),9.8);assert.equal(await events(),4);assert.equal(await moves(),4);
 // Suspension wins while the real import is waiting; no event or stock write follows.
 await blocker.query('BEGIN');await blocker.query("UPDATE ai_accounts SET status='suspended' WHERE id=$1",[account]);
 const suspended=run(binding,sale('suspended-sale'));await waitBlocked();await blocker.query('COMMIT');
 await assert.rejects(suspended,e=>e.status===403);assert.equal(await balance(),9.8);assert.equal(await events(),4);assert.equal(await moves(),4);
 await control.query("UPDATE ai_accounts SET status='active' WHERE id=$1",[account]);
 // Revoking a connector while the account is locked must beat a stale binding.
 await blocker.query('BEGIN');await blocker.query('SELECT id FROM ai_accounts WHERE id=$1 FOR UPDATE',[account]);
 const stale=run(binding,sale('stale-connector'));await waitBlocked();
 await blocker.query('UPDATE ai_connectors SET active=false WHERE id=$1',[connectorId]);await blocker.query('COMMIT');
 await assert.rejects(stale,e=>e.status===403);assert.equal(await balance(),9.8);assert.equal(await events(),4);
 await control.query('UPDATE ai_connectors SET active=true WHERE id=$1',[connectorId]);
 // A physical stock correction that commits before the import must be read fresh.
 await blocker.query('BEGIN');await blocker.query('SELECT id FROM ai_stock WHERE id=$1 FOR UPDATE',[stock]);
 const corrected=run(binding,sale('after-correction'));
 // Observe the actual ingredient wait, not a fixed delay.
 let observed=false;for(let i=0;i<300;i++){
  const waiting=await admin.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id,quantity FROM ai_stock%' AND $1::int=ANY(pg_blocking_pids(pid))",[blocker.processID]);
  if(waiting.rowCount){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert(observed,'Expected ingredient row lock wait');await blocker.query('UPDATE ai_stock SET quantity=20 WHERE id=$1',[stock]);await blocker.query('COMMIT');await corrected;
 assert.equal(await balance(),19.9);
 const audit=(await control.query('SELECT quantity_before,quantity_after FROM ai_stock_moves ORDER BY id DESC LIMIT 1')).rows[0];
 assert.equal(Number(audit.quantity_before),20);assert.equal(Number(audit.quantity_after),19.9);
 console.log('Real PostgreSQL sales ledger passed: concurrent replay, distinct sales, competing reversals, suspension, connector revocation and fresh locked balances.');
}finally{
 await blocker?.query('ROLLBACK').catch(()=>{});blocker?.release();
 await Promise.allSettled(runs);await Promise.all([db.end(),control.end()]);
 await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();delete globalThis.salesLedgerRacePool;
}

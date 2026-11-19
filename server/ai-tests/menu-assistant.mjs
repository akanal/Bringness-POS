import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {migrateAiMenu,aiMenuRoutes} from '../ai-menu.js';
const connectionString=process.env.MENU_TEST_DATABASE_URL;let admin,schema;
if(connectionString){const u=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/bringness_device_test');admin=new pg.Pool({connectionString});schema='menu_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);}
const engine=connectionString?new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=15000'}):new PGlite();if(!connectionString)await engine.waitReady;else engine.exec=sql=>engine.query(sql);
const query=async(sql,args)=>{if(sql.includes('CREATE TABLE')){await engine.exec(sql);return {rows:[],rowCount:0}}const r=await engine.query(sql,args);return {...r,rowCount:r.rowCount??(r.rows.length||r.affectedRows||0)}};
const db={query,connect:connectionString?()=>engine.connect():async()=>({query,release(){}})},account=randomUUID(),other=randomUUID(),loc=randomUUID(),foreign=randomUUID(),recipe=randomUUID(),stock=randomUUID(),user={id:account,role:'restaurant'};
const call=(path,method='GET',b={},u=user,extra={})=>aiMenuRoutes('/api/ai/menu'+path,method,b,u,new URL('http://local/?locationId='+loc),{db,...extra});
try{
 await engine.exec('CREATE TABLE ai_accounts(id uuid PRIMARY KEY,role text,status text);CREATE TABLE ai_locations(id uuid PRIMARY KEY,account_id uuid);CREATE TABLE ai_sessions(token_hash text PRIMARY KEY,account_id uuid,expires_at timestamptz);CREATE TABLE ai_recipes(id uuid PRIMARY KEY,account_id uuid,location_id uuid,name text,external_code text,active boolean);CREATE TABLE ai_stock(id uuid PRIMARY KEY,account_id uuid,location_id uuid,name text,unit text,quantity numeric,reserved_quantity numeric);CREATE TABLE ai_recipe_items(recipe_id uuid,stock_id uuid,quantity numeric);CREATE TABLE ai_confirmed_purchase_prices(stock_id uuid,account_id uuid,unit text,unit_cents bigint,received_at timestamptz,source_id uuid);CREATE TABLE ai_audit(actor_id uuid,target_id uuid,action text);');
 await migrateAiMenu(db);await migrateAiMenu(db);
 await query("INSERT INTO ai_accounts VALUES($1,'restaurant','active'),($2,'restaurant','active')",[account,other]);await query('INSERT INTO ai_locations VALUES($1,$2),($3,$4)',[loc,account,foreign,other]);
 await query("INSERT INTO ai_recipes VALUES($1,$2,$3,'Suppe','soup',true)",[recipe,account,loc]);await query("INSERT INTO ai_stock VALUES($1,$2,$3,'Karotte','kg',3,1)",[stock,account,loc]);await query('INSERT INTO ai_recipe_items VALUES($1,$2,0.5)',[recipe,stock]);
 assert.equal((await call('')).settings.enabled,false);await assert.rejects(call('/draft','POST',{locationId:loc,id:randomUUID()}),e=>e.status===403);
 await assert.rejects(call('','GET',{}, {id:other,role:'restaurant'}),e=>e.status===404);await assert.rejects(call('','GET',{}, {id:account,role:'dealer'}),e=>e.status===403);
 await assert.rejects(call('','GET',{},user,{sessionHash:'expired'}),e=>e.status===401);
 let version=0;const settings=async(enabled=true)=>{const r=await call('/settings','POST',{locationId:loc,enabled,readCosts:true,readStock:true,version});version=r.settings.version;};await settings();
 const data=await call('');assert.equal(data.recipes.length,1);assert.equal(data.recipes[0].cost.netCents,null);
 const content={title:'Unsere Karte',items:[{recipeId:recipe,name:'Suppe',category:'Suppen',description:'',priceCents:650,visible:true}]};
 const make=async(overrides={})=>{const b={locationId:loc,id:randomUUID(),settingsVersion:version,baseRevision:(await call('')).card?.revision||0,content,...overrides};await call('/draft','POST',b);return b};
 const first=await make();assert.equal((await call('')).card,null);assert.equal((await call('/draft','POST',first)).replayed,true);
 await assert.rejects(call('/draft','POST',{...first,content:{...content,title:'Andere Karte'}}),e=>e.status===409);
 const decide=(b,decision='approve',confirmed=true)=>call('/decide','POST',{locationId:loc,id:b.id,version:1,decision,confirmed});
 await assert.rejects(decide(first,'approve',false),e=>e.status===400);assert.equal((await call('')).card,null);
 await query("UPDATE ai_recipes SET name='Neue Suppe' WHERE id=$1",[recipe]);await assert.rejects(decide(first),e=>e.status===409);await decide(first,'reject');
 const second=await make();await decide(second);assert.equal((await call('')).card.revision,1);assert.equal((await decide(second)).replayed,true);
 await assert.rejects(decide(second,'reject'),e=>e.status===409);
 const stale=await make();const newer=await make({content:{...content,title:'Neue Karte'}});await decide(newer);await assert.rejects(decide(stale),e=>e.status===409);
 const revoked=await make();await settings(false);await assert.rejects(decide(revoked),e=>e.status===403);assert.equal((await call('')).recipes.length,0);await settings();await assert.rejects(decide(revoked),e=>e.status===409);
 const noPrice=await make({content:{...content,items:[{...content.items[0],priceCents:null}]}});await assert.rejects(decide(noPrice),e=>e.status===400);
 const cross={...content,items:[{...content.items[0],recipeId:randomUUID()}]};await assert.rejects(make({content:cross}),e=>e.status===400);
 const costs=await make();await query("INSERT INTO ai_confirmed_purchase_prices VALUES($1,$2,'kg',200,now(),$3)",[stock,account,randomUUID()]);await assert.rejects(decide(costs),e=>e.status===409);
 assert.equal(Number((await query('SELECT quantity FROM ai_stock')).rows[0].quantity),3);assert.equal((await query('SELECT name FROM ai_recipes')).rows[0].name,'Neue Suppe');
 assert.equal((await call('')).card.content.title,'Neue Karte');
 if(connectionString){const a=await make(),b=await make({content:{...content,title:'Concurrent'}});const results=await Promise.allSettled([decide(a),decide(b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const blocker=await engine.connect();let pid;try{await blocker.query('BEGIN');await blocker.query("UPDATE ai_accounts SET status='suspended' WHERE id=$1",[account]);const tracked={connect:async()=>{const c=await engine.connect();pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;return c;}};const waiting=aiMenuRoutes('/api/ai/menu','GET',{},user,new URL('http://local/?locationId='+loc),{db:tracked});waiting.catch(()=>{});let blocked=false;for(let i=0;i<200;i++){if(pid&&(await admin.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[pid])).rowCount){blocked=true;break}await new Promise(r=>setTimeout(r,5));}assert(blocked);await blocker.query('COMMIT');await assert.rejects(waiting,e=>e.status===403);}finally{await blocker.query('ROLLBACK');blocker.release();}}
 console.log('Menu assistant database acceptance passed: disabled defaults, account/location/session isolation, explicit approval, immutable decisions/replay, data/grant/card invalidation, required prices, and unchanged recipe/stock data.');
}finally{if(connectionString){await engine.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}else await engine.close();}

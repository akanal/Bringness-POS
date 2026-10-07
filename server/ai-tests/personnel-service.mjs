import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
const db=new PGlite();await db.waitReady;
const user='00000000-0000-4000-8000-000000000001',employee='00000000-0000-4000-8000-000000000002',restaurant='00000000-0000-4000-8000-000000000003',company='00000000-0000-4000-8000-000000000004',table='00000000-0000-4000-8000-000000000005';
await db.exec("CREATE TABLE employees(id uuid PRIMARY KEY,user_id uuid,restaurant_id uuid,active boolean,role text,duty_state text);CREATE TABLE restaurants(id uuid,company_id uuid,name text,mode text);CREATE TABLE dining_tables(id uuid PRIMARY KEY,restaurant_id uuid,waiter_employee_id uuid,name text,area text,status text,sort_order int);CREATE TABLE orders(id uuid,table_id uuid,source text,status text,created_at timestamptz,total_cents int);CREATE TABLE products(id uuid,restaurant_id uuid,name text,price_cents int,active boolean,ai_stock_available boolean);CREATE TABLE waiter_push_subscriptions(user_id uuid,endpoint text,subscription jsonb);");
await db.query("INSERT INTO employees VALUES($1,$2,$3,true,'waiter','off')",[employee,user,restaurant]);await db.query("INSERT INTO restaurants VALUES($1,$2,'Restaurant','restaurant')",[restaurant,company]);await db.query("INSERT INTO dining_tables VALUES($1,$2,$3,'Tisch 1','Saal','open',1)",[table,restaurant,employee]);await db.query("INSERT INTO orders VALUES(gen_random_uuid(),$1,'qr','open',now(),2500)",[table]);await db.query("INSERT INTO waiter_push_subscriptions VALUES($1,'https://push.example','{}')",[user]);
const pool={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length}}};
const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8'),lines=source.split('\n');
const guard=lines.find(l=>l.startsWith('if(p.startsWith("/api/v1/waiter/")&&!'));
const routes=['/api/v1/waiter/bootstrap','/api/v1/waiter/alerts'].map(p=>lines.find(l=>l.startsWith('if(p==="'+p+'"')));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handler=new AsyncFunction('req','res','p','u','pool','auth','currentUser','requireFeature','json',guard+'\n'+routes.join('\n'));
async function request(path){const u=new URL('https://example'+path);let result;await handler({method:'GET'},{},u.pathname,u,pool,async()=>({id:user,company_id:company,role:'waiter',display_name:'Service'}),async()=>({id:user}),async()=>true,(_res,status,data)=>{result={status,...data}});return result}
const off=await request('/api/v1/waiter/bootstrap');assert.equal(off.employee.duty_state,'off');assert.equal(off.tables.length,0);assert.equal((await request('/api/v1/waiter/alerts')).orders.length,0);assert.equal((await request('/api/v1/waiter/tables/'+table)).status,403);
await db.query("UPDATE employees SET duty_state='working'");
const working=await request('/api/v1/waiter/bootstrap');assert.equal(working.tables.length,1);assert.equal((await request('/api/v1/waiter/alerts')).orders.length,1);
const pushSql=source.match(/const waiterPush=\(await c\.query\("([^"]+)"/)[1];assert.equal((await pool.query(pushSql,[table])).rowCount,1);
await db.query("UPDATE employees SET duty_state='paused'");assert.equal((await request('/api/v1/waiter/alerts')).orders.length,0);assert.equal((await pool.query(pushSql,[table])).rowCount,0);
await db.query("UPDATE employees SET duty_state='off'");assert.equal((await request('/api/v1/waiter/alerts')).dutyState,'off');assert.equal((await pool.query(pushSql,[table])).rowCount,0);assert.equal((await pool.query('SELECT id FROM orders')).rowCount,1);
// Verify the actual phone UI shows off-duty state and provides private reporting.
const dom=new JSDOM(fs.readFileSync(new URL('../../apps/web/public/service/index.html',import.meta.url),'utf8'),{url:'https://example/service/',runScripts:'outside-only'}),w=dom.window;
w.localStorage.setItem('bringness-waiter-token','token');w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async url=>({ok:true,json:async()=>String(url).includes('/waiter/bootstrap')?off:String(url).includes('/waiter/alerts')?{orders:[],dutyState:'off',serverTime:new Date().toISOString()}:{month:'2026-10',totals:[],shifts:[],generatedAt:new Date().toISOString()}});
w.eval(fs.readFileSync(new URL('../../apps/web/public/personnel-report.js',import.meta.url),'utf8'));w.eval(fs.readFileSync(new URL('../../apps/web/public/service/app.js',import.meta.url),'utf8'));
await new Promise(resolve=>setTimeout(resolve,25));
assert(w.document.getElementById('dutyState').textContent.includes('Nicht im Dienst'));assert.equal(w.document.querySelectorAll('[data-table]').length,0);assert(w.document.getElementById('dutyForm'));w.document.getElementById('myTimes').open=true;await new Promise(resolve=>setTimeout(resolve,25));assert(w.document.querySelector('[data-report-print]'));w.close();await db.close();
console.log('Service duty passed: actual SQL excludes off-duty/paused alerts and push, retains open orders, blocks table access, exposes phone clock and private monthly report.');

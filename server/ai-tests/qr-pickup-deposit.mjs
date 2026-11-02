import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {migrateDeposit} from '../pos-deposit.js';
import {handleRestaurantOwnerFeature} from '../restaurant-owner-features.js';
import {createQrService} from '../qr-service-core.js';
import {createDisplays,migrateDisplays} from '../displays.js';
const db=new PGlite();await db.waitReady;
await db.exec(`CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text,qr_service_mode text,logo_data text);
CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,name text,price_cents int,tax_rate numeric,active boolean DEFAULT true,ai_stock_available boolean DEFAULT true);
CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
CREATE TABLE pos_cash_sessions(id uuid PRIMARY KEY);
CREATE TABLE dining_tables(id uuid PRIMARY KEY,restaurant_id uuid,name text,area text,qr_token text,status text,waiter_employee_id uuid,waiter_employee_ids uuid[] DEFAULT '{}');
CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid,table_id uuid,source text,status text,total_cents int,guest_request_id uuid,guest_email text,qr_service_mode text,qr_ready_at timestamptz,created_at timestamptz DEFAULT now(),pickup_number int DEFAULT 1);
CREATE TABLE order_items(id uuid DEFAULT gen_random_uuid(),order_id uuid,product_id uuid,product_name_snapshot text,unit_price_cents int,tax_rate_snapshot numeric,quantity numeric,guest_note text,extras_snapshot jsonb);
CREATE TABLE company_features(company_id uuid,feature_code text,status text,ends_at timestamptz,grace_until timestamptz);
CREATE TABLE company_entitlements(company_id uuid,plan_id uuid,status text);CREATE TABLE billing_plans(id uuid,code text);
CREATE TABLE pos_trade_sales(order_id uuid);`);
const pool={query:(s,a)=>db.query(s,a),connect:async()=>({...pool,release(){}})};
await migrateDeposit({query:s=>db.exec(s)});await migrateDisplays({query:s=>db.exec(s)});
const rid=crypto.randomUUID(),uid=crypto.randomUUID(),tid=crypto.randomUUID(),pid=crypto.randomUUID(),code='a'.repeat(48),token='fixture',hash=s=>crypto.createHash('sha256').update(s).digest('hex');
await db.query("INSERT INTO restaurants VALUES($1,$1,'Fixture','pickup',NULL,NULL)",[rid]);
await db.query("INSERT INTO users VALUES($1,$2,'owner','active',false)",[uid,rid]);
await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[uid,hash(token)]);
await db.query("INSERT INTO dining_tables(id,restaurant_id,name,qr_token) VALUES($1,$2,'1',$3)",[tid,rid,code]);
await db.query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,'Menü',1600,19)",[pid,rid]);
await db.query("INSERT INTO pos_deposit_rules VALUES($1,25,2,'Flasche',19)",[pid]);
for(const feature of ['pos_base','table_management','counter_qr','display_control'])await db.query("INSERT INTO company_features VALUES($1,$2,'active',NULL,NULL)",[rid,feature]);
await db.query("INSERT INTO pos_displays(restaurant_id,name,orientation,fit,token,mode) VALUES($1,'Fixture','landscape','contain',$2,'pickup')",[rid,'b'.repeat(48)]);
async function call(handler,path,body,auth=token){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url:path,method:body?'POST':'GET',headers:{authorization:'Bearer '+auth,'x-personnel-unlock':'unlock','content-type':'application/json'}});let status,data;await handler(req,{writeHead(s){status=s},end(s){data=JSON.parse(s)}},{db:pool});return {status,data};}
const requestId=crypto.randomUUID(),body={code,requestId,items:[{productId:pid,qty:2}],depositCents:100};
// Wrong/stale or missing deposit cannot create a partial order or silently undercharge.
assert.equal((await call(handleRestaurantOwnerFeature,'/api/v1/guest/order-v2',{...body,depositCents:0})).status,409);
assert.equal((await db.query('SELECT * FROM orders')).rows.length,0);
const result=await call(handleRestaurantOwnerFeature,'/api/v1/guest/order-v2',body);assert.equal(result.status,201);assert.equal(result.data.totalCents,3300);
const order=result.data.orderId;
assert.equal((await db.query('SELECT sum(unit_price_cents*quantity)::int n FROM order_items WHERE order_id=$1',[order])).rows[0].n,3300);
assert.equal((await db.query('SELECT quantity FROM pos_deposit_lines WHERE order_id=$1',[order])).rows[0].quantity,4);
assert.equal((await call(handleRestaurantOwnerFeature,'/api/v1/guest/order-v2',body)).data.orderId,order);
assert.equal((await db.query('SELECT * FROM pos_deposit_lines')).rows.length,1);
const service=createQrService(pool),display=createDisplays(pool),player='/api/v1/display-player/'+'b'.repeat(48);
assert.equal((await call(service,'/api/v1/orders/'+order+'/collection-collected',{})).status,409);
assert.equal((await call(service,'/api/v1/orders/'+order+'/collection-ready',{})).status,200);
assert.equal((await call(display,player)).data.orders[0].ready,true);
assert.equal((await call(service,'/api/v1/orders/'+order+'/collection-collected',{})).status,200);
assert.equal((await call(service,'/api/v1/orders/'+order+'/collection-collected',{})).status,200);
assert.equal((await call(display,player)).data.orders.length,0);
assert.equal((await db.query('SELECT status,total_cents FROM orders WHERE id=$1',[order])).rows[0].status,'open');
assert.equal((await call(service,'/api/v1/guest/collection?orderId='+order+'&requestId='+requestId)).data.collected,true);
const html=fs.readFileSync(new URL('../../apps/web/public/tisch/index.html',import.meta.url),'utf8');
const w=new JSDOM(html,{url:'https://fixture.test/tisch/?code='+code,runScripts:'outside-only',pretendToBeVisual:true}).window;
const guestFlights=[],guestTimers=[];w.setInterval=fn=>{guestTimers.push(fn);return 0};let scrolls=0;w.HTMLElement.prototype.scrollIntoView=()=>{scrolls++};
w.fetch=async(path,init)=>{
 if(path.startsWith('/api/v1/guest/menu'))return {ok:true,json:async()=>({restaurant:'Fixture',table:'1',products:[{id:pid,name:'Menü',price_cents:1600,deposit_cents:50}]})};
 if(path.startsWith('/api/v1/guest/service-mode'))return {ok:true,json:async()=>({mode:'pickup'})};
 if(path.startsWith('/api/v1/guest/collection')){const task=call(service,path);guestFlights.push(task);const result=await task;return {ok:result.status<400,json:async()=>result.data};}
 if(path==='/api/v1/guest/order'){
  const result=await call(handleRestaurantOwnerFeature,path,JSON.parse(init.body));return {ok:result.status<400,json:async()=>result.data};
 }
 return {ok:true,json:async()=>({})};
};
w.eval(fs.readFileSync(new URL('../../apps/web/public/tisch/app.js',import.meta.url),'utf8'));
w.eval(fs.readFileSync(new URL('../../apps/web/public/tisch/collection.js',import.meta.url),'utf8'));
await new Promise(resolve=>setImmediate(resolve));
assert.match(w.document.getElementById('menu').textContent,/0,50.*Pfand/);
w.document.querySelector('[data-add]').click();assert.match(w.document.getElementById('total').textContent,/16,50/);assert.match(w.document.getElementById('basket').textContent,/Davon Pfand.*0,50/);assert.equal(w.document.getElementById('depositSummary').hidden,false);assert.match(w.document.getElementById('depositTotal').textContent,/0,50/);
await w.document.getElementById('send').onclick();assert.equal(scrolls,0);assert.match(w.document.getElementById('heading').textContent,/Bestellung übermittelt/);
assert.equal(w.document.getElementById('status').previousElementSibling.id,'guestCheckoutContents');
await Promise.all(guestFlights);await new Promise(resolve=>setImmediate(resolve));
assert.equal(w.document.getElementById('status').closest('[hidden]'),null);
assert.equal(w.document.getElementById('guestCollection').closest('[hidden]'),null);
const guestOrder=(await db.query('SELECT id FROM orders WHERE id<>$1',[order])).rows[0].id;
await call(service,'/api/v1/orders/'+guestOrder+'/collection-ready',{});
await guestTimers[1]();assert.match(w.document.getElementById('guestCollection').textContent,/Bitte am Tresen abholen/);
assert.equal(w.document.getElementById('guestCollection').closest('[hidden]'),null);w.close();
// Exercise the actual POS table button against the SQL-backed pickup handler.
const pos=new JSDOM('<div id="tableFeedback"></div>',{url:'https://fixture.test/pos/',runScripts:'outside-only'}).window;
pos.HTMLElement.prototype.scrollIntoView=()=>{};
const newer=(await db.query('SELECT id FROM orders WHERE id<>$1',[order])).rows[0].id;
await call(service,'/api/v1/orders/'+newer+'/collection-ready',{});
pos.api=async(path,init)=>{
 if(path.includes('/details')){
  const orders=(await db.query("SELECT *,'[]'::json items FROM orders WHERE table_id=$1",[tid])).rows;
  return {orders};
 }
 const result=await call(service,'/api/v1'+path,init?{}:undefined);if(result.status>=400)throw Error(result.data.error);return result.data;
};
const source=fs.readFileSync(new URL('../../apps/web/public/pos/app.js',import.meta.url),'utf8');
const details=source.slice(source.indexOf('async function openTableDetails('),source.indexOf('function showTableOrderForm('));
pos.eval('const $=id=>document.getElementById(id),esc=s=>String(s??""),euro=c=>String(c);'+details);
await pos.openTableDetails({id:tid,name:'1'},rid);
assert.equal(pos.document.querySelector('[data-table-collection-ready="'+newer+'"]'),null,'no second staff action after readiness');
assert.equal((await call(display,player)).data.orders.length,1,'ready number remains visible before its deadline');
await db.exec('CREATE TABLE employees(id uuid,user_id uuid,active boolean)');
assert((await call(service,'/api/v1/qr-service/queue?restaurantId='+rid)).data.orders.some(o=>o.id===newer),'unpaid ready order remains available for settlement');
await db.query("UPDATE orders SET status='paid' WHERE id=$1",[newer]);
assert(!(await call(service,'/api/v1/qr-service/queue?restaurantId='+rid)).data.orders.some(o=>o.id===newer),'paid ready order needs no collected action in the active work queue');
assert.equal((await call(display,player)).data.orders.length,1,'payment does not hide the ready display number early');assert((await call(service,'/api/v1/qr-service/display-queue?restaurantId='+rid)).data.orders.some(o=>o.id===newer&&o.displayOnly),'paid ready numbers remain removable from waiter display controls');
await db.query("UPDATE orders SET qr_ready_at=now()-interval '30 minutes' WHERE id=$1",[newer]);
assert.equal((await call(display,player)).data.orders.length,0);assert.equal((await db.query('SELECT pickup_collected_at FROM orders WHERE id=$1',[newer])).rows[0].pickup_collected_at,null,'expiry is not collection');pos.close();

// Server-confirmed waiter dismissal reaches both displays, is undoable and keeps accounting intact.
await db.exec('ALTER TABLE employees ADD COLUMN restaurant_id uuid;CREATE TABLE personnel_unlocks(token_hash text,session_hash text,user_id uuid,expires_at timestamptz)');
const waiter=crypto.randomUUID(),employee=crypto.randomUUID(),waiterToken='waiter-clear',visibleOrder=crypto.randomUUID(),visibilityRequest=crypto.randomUUID();
await db.query("INSERT INTO users VALUES($1,$2,'waiter','active',false)",[waiter,rid]);await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[waiter,hash(waiterToken)]);await db.query('INSERT INTO employees(id,user_id,restaurant_id,active) VALUES($1,$2,$3,true)',[employee,waiter,rid]);await db.query('UPDATE dining_tables SET waiter_employee_id=$2 WHERE id=$1',[tid,employee]);await db.query("INSERT INTO personnel_unlocks VALUES($1,$2,$3,now()+interval '1 hour')",[hash('unlock'),hash(token),uid]);
await db.query("INSERT INTO orders(id,restaurant_id,table_id,source,status,total_cents,qr_service_mode,pickup_number,guest_request_id) VALUES($1,$2,$3,'qr','preparing',3300,'pickup',77,$4)",[visibleOrder,rid,tid,crypto.randomUUID()]);
const path='/api/v1/orders/'+visibleOrder+'/display-visibility',unchanged=(await db.query('SELECT status,total_cents,qr_ready_at,pickup_collected_at FROM orders WHERE id=$1',[visibleOrder])).rows[0];
const hide=await call(service,path,{hidden:true,requestId:visibilityRequest},waiterToken);assert.equal(hide.status,200);assert.equal(hide.data.undoAllowed,true);assert(!(await call(display,player)).data.orders.some(o=>o.number==='077'));
const hiddenAt=(await db.query('SELECT pickup_display_hidden_at FROM orders WHERE id=$1',[visibleOrder])).rows[0].pickup_display_hidden_at;assert.equal((await call(service,path,{hidden:true,requestId:visibilityRequest},waiterToken)).status,200);assert.deepEqual((await db.query('SELECT pickup_display_hidden_at FROM orders WHERE id=$1',[visibleOrder])).rows[0].pickup_display_hidden_at,hiddenAt);
await db.query('UPDATE dining_tables SET waiter_employee_id=NULL WHERE id=$1',[tid]);assert.equal((await call(service,path,{hidden:false,requestId:visibilityRequest},waiterToken)).status,403);await db.query('UPDATE dining_tables SET waiter_employee_id=$2 WHERE id=$1',[tid,employee]);assert.equal((await call(service,path,{hidden:false,requestId:visibilityRequest},waiterToken)).status,200);assert((await call(display,player)).data.orders.some(o=>o.number==='077'));
assert.equal((await call(service,path,{hidden:true,requestId:visibilityRequest},'missing-token')).status,401);assert.equal((await call(service,path,{hidden:true,requestId:visibilityRequest,companyId:rid},waiterToken)).status,400);
await call(service,path,{hidden:true,requestId:visibilityRequest},waiterToken);
const snapshot=(await call(display,'/api/v1/displays/pickup?restaurantId='+rid)).data.serverTime,futureOrder=crypto.randomUUID();
await db.query("INSERT INTO orders(id,restaurant_id,table_id,source,status,total_cents,qr_service_mode,pickup_number,created_at) VALUES($1,$2,$3,'qr','preparing',100,'pickup',78,$4)",[futureOrder,rid,tid,new Date(Date.parse(snapshot)+1000).toISOString()]);
assert.equal((await call(display,'/api/v1/displays/pickup/clear?restaurantId='+rid,{before:snapshot})).status,200);
assert.equal((await call(service,path,{hidden:false,requestId:visibilityRequest},waiterToken)).status,409,'old undo cannot undo an administrator clear');
assert((await call(display,player)).data.orders.some(o=>o.number==='078'),'orders arriving after loaded snapshot stay visible');
assert.equal((await call(display,'/api/v1/displays/pickup/clear?restaurantId='+rid,{before:snapshot})).status,200);assert((await call(display,player)).data.orders.some(o=>o.number==='078'));
assert.equal((await call(display,'/api/v1/displays/pickup/'+futureOrder+'/hide?restaurantId='+rid,{})).status,200);assert.equal((await call(display,player)).data.orders.length,0);
assert.deepEqual((await db.query('SELECT status,total_cents,qr_ready_at,pickup_collected_at FROM orders WHERE id=$1',[visibleOrder])).rows[0],unchanged);
assert.equal((await call(service,'/api/v1/guest/collection?orderId='+order+'&requestId='+requestId)).data.depositCents,100);
await db.close();console.log('PASS: actual deposit trigger, exact totals, rollback, replay, single readiness action and display-only expiry');

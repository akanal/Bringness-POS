import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import {Readable} from 'node:stream';import {PGlite} from '@electric-sql/pglite';import {JSDOM} from 'jsdom';import {createDisplays,migrateDisplays,displayAccess} from '../displays.js';
const db=new PGlite();await db.waitReady;
const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length}};
const pool={query,connect:async()=>({query,release(){}})},id=()=>crypto.randomUUID(),company=id(),owner=id(),rid=id(),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
await db.exec(`CREATE TABLE orders(id uuid PRIMARY KEY,restaurant_id uuid,table_id uuid,source text DEFAULT 'pos',qr_ready_at timestamptz,status text,created_at timestamptz DEFAULT now());CREATE TABLE pos_trade_sales(order_id uuid);CREATE TABLE dining_tables(id uuid PRIMARY KEY,restaurant_id uuid,name text,qr_token text,area text);CREATE TABLE company_features(company_id uuid,feature_code text,status text,ends_at timestamptz,grace_until timestamptz);CREATE TABLE company_entitlements(company_id uuid,plan_id uuid,status text);CREATE TABLE billing_plans(id uuid,code text);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text,qr_service_mode text,logo_data text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);CREATE TABLE personnel_unlocks(token_hash text,session_hash text,user_id uuid,expires_at timestamptz);CREATE TABLE categories(id uuid PRIMARY KEY,restaurant_id uuid,name text,sort_order int);CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,name text,price_cents int,category_id uuid,active boolean,ai_stock_available boolean);`);
await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Testbetrieb')",[rid,company]);await query("INSERT INTO users(id,company_id,role,status) VALUES($1,$2,'owner','active')",[owner,company]);await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[owner,hash('owner')]);await query("INSERT INTO personnel_unlocks VALUES($1,$2,$3,now()+interval '1 hour')",[hash('unlock'),hash('owner'),owner]);
await query("INSERT INTO company_features VALUES($1,'pos_base','active',NULL,NULL),($1,'display_control','active',NULL,NULL)",[company]);
await migrateDisplays(pool);let handler=createDisplays(pool);
assert(await displayAccess(pool,company));await query("DELETE FROM company_features WHERE feature_code='pos_base'");assert.equal(await displayAccess(pool,company),false);const downloadPlan=id();await query("INSERT INTO billing_plans VALUES($1,'download_license')",[downloadPlan]);await query("INSERT INTO company_entitlements VALUES($1,$2,'active')",[company,downloadPlan]);assert(await displayAccess(pool,company));await query("DELETE FROM company_entitlements");await query("INSERT INTO company_features VALUES($1,'restaurant','active',NULL,NULL)",[company]);assert(await displayAccess(pool,company));await query("DELETE FROM company_features WHERE feature_code='restaurant'");await query("INSERT INTO company_features VALUES($1,'pos_base','active',NULL,NULL)",[company]);

const png=Buffer.from('89504e470d0a1a0a00000000','hex');
async function call(path,{method='GET',body=null,mime='application/json',publicCall=false}={}){
 const req=Readable.from(body===null?[]:[Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:path,method,headers:publicCall?{}:{authorization:'Bearer owner','x-personnel-unlock':'unlock','content-type':mime}});let status,headers,result;assert(await handler(req,{writeHead(s,h){status=s;headers=h},end(raw){result=headers?.['content-type']==='application/json'?JSON.parse(raw):raw}}));return {status,headers,result};
}
const base='/api/v1/displays',q='?restaurantId='+rid;
const upload=async()=>{const r=await call(base+'/media'+q,{method:'POST',mime:'image/png',body:png});assert.equal(r.status,201);return r.result};
for(const [mime,body] of [['image/png',Buffer.from('<html>invalid</html>')],['video/mp4',png]])assert.equal((await call(base+'/media'+q,{method:'POST',mime,body})).status,400);
await query("UPDATE company_features SET ends_at=now()-interval '1 second' WHERE feature_code='display_control'");assert.equal((await call(base+q)).status,403);await query("UPDATE company_features SET ends_at=NULL WHERE feature_code='display_control'");
const original=await upload(),payload={name:'A Theke',orientation:'landscape',fit:'contain',playlist:[{type:'image',mediaId:original.id,seconds:15}]};
const first=(await call(base+q,{method:'POST',body:payload})).result,second=(await call(base+q,{method:'POST',body:{...payload,name:'B Eingang'}})).result;assert.notEqual(first.token,second.token);
await query("UPDATE company_features SET ends_at=now()-interval '1 second' WHERE feature_code='display_control'");assert.equal((await call('/api/v1/display-player/'+first.token,{publicCall:true})).status,403);assert.equal((await call('/api/v1/display-player/'+first.token+'/media/'+original.id,{publicCall:true})).status,403);await query("UPDATE company_features SET ends_at=NULL WHERE feature_code='display_control'");
// Restart handlers/migrations: server content and distinct screen links survive without client storage.
await migrateDisplays(pool);handler=createDisplays(pool);
const screens=(await call(base+q)).result.displays;assert.equal(screens.find(d=>d.id===first.id).token,first.token);assert.equal(screens.find(d=>d.id===first.id).playlist[0].mediaId,original.id);
let library=(await call(base+'/media'+q)).result.media;assert.equal(library[0].id,original.id);assert.equal(library[0].content,undefined);
assert.deepEqual(Buffer.from((await call('/api/v1/display-player/'+first.token+'/media/'+original.id,{publicCall:true})).result),png);
// Browser upload saves its assignment immediately; reopening never asks for an upload.
const source=fs.readFileSync(new URL('../../apps/web/public/pos/displays.js',import.meta.url),'utf8');
async function browser(){const w=new JSDOM('<select id="restaurant"><option value="'+rid+'" selected>Betrieb</option></select><div id="moreMenu"></div><div id="kasseView"><button id="testSale">Artikel buchen</button></div><div id="moduleView" class="show"><div id="moduleBody"></div></div>',{url:'https://bringness.de/pos/',runScripts:'outside-only'}).window;w.URL.revokeObjectURL=()=>{};w.localStorage.setItem('bringness-pos-token','owner');w.fetch=async(path,options={})=>{if(path.endsWith('/branding'))return {ok:true,json:async()=>({restaurant:{name:'Betrieb',logo_data:'data:image/png;base64,'+png.toString('base64')}})};if(path==='/api/v1/bootstrap')return {ok:true,json:async()=>({restaurants:[{id:rid,name:'Betrieb'}],categories:[],products:[]})};const r=await call(path,{method:options.method||'GET',mime:options.headers?.['content-type']||'application/json',body:options.body?(typeof options.body==='string'?JSON.parse(options.body):png):null});return {ok:r.status<400,json:async()=>r.result}};w.eval(source);await w.renderDisplaySettings();assert(w.document.querySelector('#displaySelect'),w.document.getElementById('moduleBody').textContent);return w}
let w=await browser();assert.equal(w.document.querySelector('#displaySelect').value,first.id);const input=w.document.querySelector('#displayReplaceUpload');input.dataset.index='0';Object.defineProperty(input,'files',{value:[new w.File([png],'replacement.png',{type:'image/png'})]});await input.onchange({target:input});assert.match(w.document.querySelector('#displayStatus').textContent,/Dauerhaft auf dem Server gespeichert/);w.close();
const saved=(await call(base+q)).result.displays.find(d=>d.id===first.id);assert.equal(saved.token,first.token);assert.equal(saved.playlist.length,1);assert.notEqual(saved.playlist[0].mediaId,original.id);
w=await browser();assert.equal(w.document.querySelector('#displaySelect').value,first.id);assert.equal(w.document.querySelector('#displayLink a').hash,'#'+first.token);assert.equal(w.document.querySelector('#displayMedia').options.length,3);assert.equal(w.document.querySelectorAll('[data-replace]').length,1);w.close();
assert.equal((await call('/api/v1/display-player/'+first.token+'/media/'+original.id,{publicCall:true})).status,404);
assert.equal((await call('/api/v1/display-player/'+second.token+'/media/'+original.id,{publicCall:true})).status,200);
// Actual POS module switching destroys editor previews, while live players stay independent.
w=await browser();w.focus=()=>{};const viewers=[];let openCalls=0,focusCalls=0;
w.open=(url,name)=>{openCalls++;const viewer=new JSDOM('<div id="screen"></div><div id="connection"></div><button id="fullscreen"></button>',{url,runScripts:'outside-only'}).window;viewer.closed=false;viewer.focus=()=>{focusCalls++};viewer.setTimeout=()=>0;viewer.setInterval=fn=>{viewer.refreshOutput=fn;return 0};viewer.fetch=async path=>{viewer.requestCount=(viewer.requestCount||0)+1;const r=await call(path,{publicCall:true});return {ok:r.status<400,status:r.status,json:async()=>r.result}};viewer.eval(fs.readFileSync(new URL('../../apps/web/public/display/player.js',import.meta.url),'utf8'));viewers.push({viewer,name});return viewer};
const showModuleSource=fs.readFileSync(new URL('../../apps/web/public/pos/app.js',import.meta.url),'utf8').split('const moduleHistory=')[1].split('async function downloadReceipt')[0];
w.eval("const $=id=>document.getElementById(id);const moduleInfo={belege:['Belege','','']};function isRestaurantMode(){return false}async function renderReceipts(){document.getElementById('moduleBody').textContent='Belege geöffnet'};"+"const moduleHistory="+showModuleSource);
w.document.getElementById('displayStartAndRegister').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(openCalls,1);assert.equal(viewers[0].viewer.opener,null);assert.equal(w.document.getElementById('kasseView').style.display,'block');
await w.showModule('belege');assert.equal(w.document.querySelector('#displayPreviews'),null);assert(viewers[0].viewer.document.querySelector('#screen img'));await w.showModule('kasse');
const count=viewers[0].viewer.requestCount;await viewers[0].viewer.refreshOutput();assert.equal(viewers[0].viewer.requestCount,count+1);assert(viewers[0].viewer.document.querySelector('#screen img').src.includes(saved.playlist[0].mediaId));
w.document.getElementById('bringnessDisplayOutputsToggle').click();w.document.querySelector('#bringnessOutputList button').click();assert.equal(openCalls,1);assert.equal(focusCalls,1);
w.document.querySelectorAll('#bringnessOutputList button')[1].click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(openCalls,2);assert.notEqual(viewers[0].name,viewers[1].name);
w.document.getElementById('testSale').onclick=()=>w.document.getElementById('testSale').textContent='Artikel gebucht';w.document.getElementById('testSale').click();assert.equal(w.document.getElementById('testSale').textContent,'Artikel gebucht');assert(viewers[0].viewer.document.querySelector('#screen img'));
w.close();for(const {viewer}of viewers)viewer.close();
w=await browser();w.open=()=>null;let switched=false;w.showModule=()=>{switched=true};w.document.getElementById('displayStartAndRegister').click();assert.equal(switched,false);assert.match(w.document.getElementById('bringnessDisplayOutputStatus').textContent,/Pop-ups/);w.close();
// Removing from one screen preserves server media and triggers the live-menu fallback.
w=await browser();await w.document.querySelector('[data-remove]').onclick();assert.equal((await call(base+q)).result.displays.find(d=>d.id===first.id).playlist.length,0);assert.equal((await call(base+'/media'+q)).result.media.length,2);
w.document.querySelector('#displayMedia').value=saved.playlist[0].mediaId;await w.document.querySelector('#displayReuse').onclick();w.close();
// Permanent deletion removes all same-venue assignments atomically, retaining stable URLs.
const third=(await call(base+q,{method:'POST',body:{...payload,name:'C Schaufenster'}})).result;
let usages=(await call(base+'/media'+q)).result.media.find(m=>m.id===original.id).usedBy;assert.equal(usages.length,2);
assert.equal((await call(base+'/media/'+original.id+'?restaurantId='+id(),{method:'DELETE'})).status,404);
const normalHandler=handler;handler=createDisplays({...pool,connect:async()=>({query:async(sql,args)=>{if(sql.startsWith('DELETE FROM pos_display_media'))throw Error('Simulated storage delete failure');return query(sql,args)},release(){}})});
await assert.rejects(call(base+'/media/'+original.id+q,{method:'DELETE'}),/Simulated storage/);handler=normalHandler;
assert.equal((await call(base+q)).result.displays.find(d=>d.id===second.id).playlist[0].mediaId,original.id);
w=await browser();w.confirm=message=>{assert.match(message,/B Eingang/);assert.match(message,/C Schaufenster/);return true};w.document.querySelector('#displayMedia').value=original.id;await w.document.querySelector('#displayMediaDelete').onclick();assert.match(w.document.querySelector('#displayStatus').textContent,/vom Server gelöscht/);w.close();
for(const screen of [second,third]){const found=(await call(base+q)).result.displays.find(d=>d.id===screen.id);assert.equal(found.token,screen.token);assert.deepEqual(found.playlist,[]);assert.deepEqual((await call('/api/v1/display-player/'+screen.token,{publicCall:true})).result.playlist,[])}
assert.equal((await call('/api/v1/display-player/'+second.token+'/media/'+original.id,{publicCall:true})).status,404);
assert.equal((await call(base+'/media'+q)).result.media.length,1);
assert.equal((await call(base+'/'+second.id+q,{method:'PUT',body:payload})).status,400);
assert.equal((await call(base+'/media/'+original.id+q,{method:'DELETE'})).status,404);
// Last media removed: the actual player displays the menu rather than a blank screen.
await call(base+'/media/'+saved.playlist[0].mediaId+q,{method:'DELETE'});
const fallback=(await call('/api/v1/display-player/'+first.token,{publicCall:true})).result;assert.deepEqual(fallback.playlist,[]);
const player=new JSDOM('<div id="screen"></div><div id="connection"></div><button id="fullscreen"></button>',{url:'https://bringness.de/display/index.html#'+first.token,runScripts:'outside-only'}).window;
let denied=false,refreshPlayer;player.fetch=async()=>denied?{ok:false,status:403}:{ok:true,json:async()=>({...fallback,products:[{name:'Kaffee',price_cents:250}]})};player.setTimeout=()=>0;player.setInterval=fn=>{refreshPlayer=fn;return 0};player.eval(fs.readFileSync(new URL('../../apps/web/public/display/player.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));assert.match(player.document.querySelector('#screen').textContent,/Kaffee/);denied=true;await refreshPlayer();assert.doesNotMatch(player.document.querySelector('#screen').textContent,/Kaffee/);assert.match(player.document.querySelector('#screen').textContent,/nicht aktiv/);player.close();

// One venue-wide queue: no table/area/module prerequisite; several displays show identical numbers.
const counter=id(),otherCounter=id(),qrOrder=id(),posOrder=id(),otherOrder=id(),historical=id();
await query("INSERT INTO dining_tables(id,restaurant_id,name,qr_token,area) VALUES($1,$3,'1',$4,'Innen'),($2,$3,'1',$5,'Außen')",[counter,otherCounter,rid,'a'.repeat(48),'b'.repeat(48)]);
await query("INSERT INTO orders(id,restaurant_id,table_id,status) VALUES($1,$4,$5,'preparing'),($2,$4,$5,'paid'),($3,$4,$6,'preparing')",[qrOrder,posOrder,otherOrder,rid,counter,otherCounter]);
await query("INSERT INTO orders(id,restaurant_id,status,created_at) VALUES($1,$2,'paid',now()-interval '1 hour')",[historical,rid]);
w=await browser();let editor=w.document.querySelector('#displayForm');
assert.equal(editor.elements.counterTableId,undefined);assert.equal(editor.elements.includeWalkIn,undefined);
editor.elements.mode.value='pickup';await editor.elements.mode.onchange();
assert.match(w.document.querySelector('#displayStatus').textContent,/Dauerhaft/);
let assigned=(await call(base+q)).result.displays.find(d=>d.id===first.id);
assert.equal(assigned.mode,'pickup');assert.equal(assigned.counterTableId,null);assert.equal(assigned.token,first.token);w.close();
w=await browser();assert.equal(w.document.querySelector('[name=mode]').value,'pickup');w.close();
const pickupPayload={...payload,playlist:[],mode:'pickup'};
const pickup=(await call(base+q,{method:'POST',body:pickupPayload})).result;
assert(pickup.token);const endpoint='/api/v1/display-player/'+pickup.token;
const numbers=async token=>(await call('/api/v1/display-player/'+token,{publicCall:true})).result.orders;
assert.deepEqual(await numbers(first.token),await numbers(pickup.token));assert.equal((await numbers(pickup.token)).length,3);
assert(!(await numbers(pickup.token)).some(o=>o.number===historical.slice(0,8).toUpperCase()));
// Older clients may send a table selection; it no longer narrows the queue or provisions ordering.
assert.equal((await call(base+'/'+first.id+q,{method:'PUT',body:{...pickupPayload,counterTableId:id(),includeWalkIn:true}})).status,200);
assert.equal((await query('SELECT qr_token FROM dining_tables WHERE id=$1',[counter])).rows[0].qr_token,'a'.repeat(48));
assert.equal((await query("SELECT count(*)::int n FROM company_features WHERE feature_code IN ('counter_qr','table_management')")).rows[0].n,0);
const foreignRid=id(),foreignOrder=id(),trade=id(),walkin=id(),old=id();
await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Anderer Betrieb')",[foreignRid,company]);
await query("INSERT INTO orders(id,restaurant_id,status) VALUES($1,$2,'preparing')",[foreignOrder,foreignRid]);
await query("INSERT INTO orders(id,restaurant_id,status) VALUES($1,$3,'paid'),($2,$3,'paid')",[walkin,trade,rid]);
await query('INSERT INTO pos_trade_sales VALUES($1)',[trade]);
await query("INSERT INTO orders(id,restaurant_id,table_id,status,created_at) VALUES($1,$2,$3,'paid',now()-interval '25 hours')",[old,rid,counter]);
let output=(await call(endpoint,{publicCall:true})).result;
assert.equal(output.orders.length,5);assert.equal(output.qr,null);assert.equal(output.counterName,'Abholung');assert.equal(output.token,undefined);assert.equal(output.orders[0].id,undefined);
for(const excluded of [foreignOrder,trade,historical])assert(!output.orders.some(o=>o.number===excluded.slice(0,8).toUpperCase()));
assert.equal((await call(base+'/pickup'+q)).result.orders.length,5);
for(const excluded of [foreignOrder,trade,historical])assert.equal((await call(base+'/pickup/'+excluded+'/ready'+q,{method:'POST'})).status,404);
assert(output.orders.some(o=>o.number===old.slice(0,8).toUpperCase()));
await query("UPDATE orders SET created_at=now()+interval '1 second' WHERE id=$1",[otherOrder]);
assert.equal((await numbers(pickup.token))[0].number,otherOrder.slice(0,8).toUpperCase());
await query("UPDATE orders SET created_at=now()-interval '1 second' WHERE id=$1",[otherOrder]);
assert.equal((await call(base+'/pickup/'+old+'/ready'+q,{method:'POST'})).status,200);
assert.equal((await numbers(pickup.token))[0].number,old.slice(0,8).toUpperCase());
assert.equal((await call(base+'/pickup/'+old+'/collected'+q,{method:'POST'})).status,200);
assert.equal((await call(base+'/pickup/'+otherOrder+'/collected'+q,{method:'POST'})).status,409);
assert.equal((await call(base+'/pickup/'+otherOrder+'/ready'+q,{method:'POST'})).status,200);
assert((await numbers(pickup.token)).find(o=>o.number===otherOrder.slice(0,8).toUpperCase()).ready);
assert.deepEqual(await numbers(first.token),await numbers(pickup.token));
assert.equal((await call(base+'/pickup/'+otherOrder+'/collected'+q,{method:'POST'})).status,200);
assert.equal((await numbers(pickup.token)).length,3);
await query("UPDATE orders SET status='cancelled' WHERE id=$1",[posOrder]);
await query("UPDATE orders SET status='served' WHERE id=$1",[qrOrder]);
assert.equal((await numbers(pickup.token)).length,1);
assert.equal((await call(base+'/pickup/'+walkin+'/ready'+q,{method:'POST'})).status,200);
assert.equal((await call(base+'/pickup/'+walkin+'/collected'+q,{method:'POST'})).status,200);
assert.equal((await numbers(pickup.token)).length,0);
assert.equal((await query('SELECT count(*)::int n FROM orders')).rows[0].n,8);
// Migration upgrades existing fixed displays in place, preserving capabilities and the common start.
const since=(await query('SELECT pickup_display_since FROM restaurants WHERE id=$1',[rid])).rows[0].pickup_display_since;
await query('UPDATE pos_displays SET counter_table_id=$1,walkin_since=$3 WHERE id=$2',[counter,first.id,since]);
await query('UPDATE restaurants SET pickup_display_since=NULL WHERE id=$1',[rid]);
await migrateDisplays(pool);handler=createDisplays(pool);
assert.equal(String((await query('SELECT pickup_display_since FROM restaurants WHERE id=$1',[rid])).rows[0].pickup_display_since),String(since));
assert.deepEqual(await numbers(first.token),await numbers(pickup.token));
assert.equal((await call(base+'?restaurantId='+foreignRid,{method:'POST',body:pickupPayload})).status,201);
const logo='data:image/png;base64,'+png.toString('base64');await query('UPDATE restaurants SET logo_data=$1 WHERE id=$2',[logo,rid]);
assert.equal((await call(endpoint,{publicCall:true})).result.restaurantLogo,logo);
await query("UPDATE restaurants SET logo_data='https://foreign.example/logo.svg' WHERE id=$1",[rid]);assert.equal((await call(endpoint,{publicCall:true})).result.restaurantLogo,null);
// Delayed automatic and explicit saves lock all selection controls and retain the same player link.
for(const explicit of [false,true]){
 w=await browser();const originalFetch=w.fetch;let release,started;
 const gate=new Promise(r=>release=r),start=new Promise(r=>started=r);
 w.fetch=async(path,options={})=>{if(options.method==='PUT'){started();await gate}return originalFetch(path,options)};
 const form=w.document.querySelector('#displayForm');form.elements.mode.value=explicit?'pickup':'content';
 if(explicit)form.requestSubmit();else form.elements.mode.dispatchEvent(new w.Event('change'));
 await start;for(const el of [form.elements.mode,w.document.querySelector('#displaySelect'),w.document.querySelector('#displayNew')])assert.equal(el.disabled,true);
 release();await new Promise(r=>setTimeout(r,30));assert.equal(form.elements.mode.disabled,false);assert.equal(w.document.querySelector('#displayLink a').hash,'#'+first.token);w.close();
}
w=await browser();assert.equal(w.document.querySelector('[name=mode]').value,'pickup');assert.equal(w.document.querySelector('[name=counterTableId]'),null);let previewModel;w.document.querySelector('iframe').contentWindow.postMessage=m=>previewModel=m.model;w.document.querySelector('#displayForm').oninput();assert.equal(previewModel.counterName,'Abholung');w.close();
const pickupWindow=new JSDOM('<div id="screen"></div><div id="connection"></div><button id="fullscreen"></button>',{url:'https://bringness.de/display/index.html?preview=1',runScripts:'outside-only'}).window;
pickupWindow.eval(fs.readFileSync(new URL('../../apps/web/public/display/player.js',import.meta.url),'utf8'));
pickupWindow.dispatchEvent(new pickupWindow.MessageEvent('message',{origin:pickupWindow.location.origin,source:pickupWindow.parent,data:{type:'bringness-display-preview',model:{...output,orders:[{number:'<script>bad</script>',ready:false},{number:'AB123456',ready:true}]}}}));
assert.match(pickupWindow.document.querySelector('#screen').textContent,/In Zubereitung/);assert.match(pickupWindow.document.querySelector('#screen').textContent,/AB123456/);assert.equal(pickupWindow.document.querySelector('#screen script'),null);pickupWindow.close();
console.log('Unified pickup passed: save without table/modules, identical multi-screen queues, all areas, tenant boundaries, legacy migration, trade/history exclusion, readiness/collection, stable links and save locks.');
await query('ALTER TABLE orders ADD COLUMN pickup_number bigint');
await query("INSERT INTO orders(id,restaurant_id,table_id,status,pickup_number) VALUES($1,$2,$3,'preparing',42)",[id(),rid,counter]);
assert((await numbers(pickup.token)).some(o=>o.number==='042'));
// Readiness expiry is display-only, shared by every screen and the editor queue.
const expired=id(),recent=id(),pending=id(),legacyReady=id();
await query("INSERT INTO orders(id,restaurant_id,table_id,status,created_at,qr_ready_at) VALUES($1,$5,$6,'paid',now()-interval '2 days',now()-interval '30 minutes'),($2,$5,$6,'paid',now()-interval '2 days',now()-interval '29 minutes'),($3,$5,$6,'preparing',now()-interval '2 days',NULL),($4,$5,$6,'ready',now()-interval '31 minutes',NULL)",[expired,recent,pending,legacyReady,rid,counter]);
const beforeExpiry=(await query('SELECT * FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id',[[expired,recent,pending,legacyReady]])).rows;
const visible=(await numbers(pickup.token)).map(o=>o.number);
assert(!visible.includes(expired.slice(0,8).toUpperCase()));assert(!visible.includes(legacyReady.slice(0,8).toUpperCase()));
assert(visible.includes(recent.slice(0,8).toUpperCase()));assert(visible.includes(pending.slice(0,8).toUpperCase()));
assert.deepEqual(await numbers(first.token),await numbers(pickup.token));
const queueIds=(await call(base+'/pickup'+q)).result.orders.map(o=>o.id);assert(!queueIds.includes(expired));assert(queueIds.includes(recent));
const expiry=(await numbers(pickup.token)).find(o=>o.number===recent.slice(0,8).toUpperCase()).expiresAt;assert(Number.isFinite(Date.parse(expiry)));
assert.equal((await numbers(pickup.token)).find(o=>o.number===pending.slice(0,8).toUpperCase()).expiresAt,null);
w=await browser();const panel=[...w.document.querySelectorAll('section')].find(el=>el.querySelector('h3')?.textContent==='Abholbestellungen');await panel.querySelector('button').onclick();
assert(![...panel.querySelectorAll('button')].some(b=>b.textContent==='Abgeholt'));assert.match(panel.textContent,/30 Minuten/);w.close();
assert.deepEqual((await query('SELECT * FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id',[[expired,recent,pending,legacyReady]])).rows,beforeExpiry,'display expiry never marks collected, paid or deletes orders');
// Real POS order-board rendering offers one readiness action, without a collected command.
w=new JSDOM('<div id="moduleBody"></div>',{runScripts:'outside-only'}).window;
const board=fs.readFileSync(new URL('../../apps/web/public/pos/app.js',import.meta.url),'utf8').split('async function renderOrderBoard(')[1].split('function updateHeaderClock')[0];
w.eval("const $=id=>document.getElementById(id),esc=s=>String(s??''),euro=n=>String(n);let kitchenBoardSignature='';async function renderOrderBoard("+board);
await w.renderOrderBoard('bestellungen',rid,{orders:[{id:recent,source:'qr',qr_service_mode:'pickup',status:'paid',qr_ready_at:new Date().toISOString(),created_at:new Date().toISOString(),items:[]},{id:pending,source:'qr',qr_service_mode:'pickup',status:'preparing',qr_ready_at:null,created_at:new Date().toISOString(),items:[]}]});
assert.equal(w.document.querySelectorAll('[data-collection-ready]').length,1);assert.equal(w.document.querySelector('[data-collection-ready]').dataset.collectionReady,pending);assert(![...w.document.querySelectorAll('button')].some(b=>b.textContent==='Abgeholt'));w.close();
console.log('Pickup display expiry passed: 30-minute boundary, pending retained, shared screens, queue, no order mutations and no collected buttons.');

const cleanupRid=id(),cleanupOther=id(),stale='e2569e58-0000-4000-8000-000000000001',foreign='e2569e58-0000-4000-8000-000000000002',readyCleanup='1132b4a1-0000-4000-8000-000000000001';
await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$3,'Bringness Testbetrieb'),($2,$3,'Other')",[cleanupRid,cleanupOther,company]);
await query("INSERT INTO orders(id,restaurant_id,status,created_at,qr_ready_at) VALUES($1,$4,'preparing','2026-11-01',NULL),($2,$5,'preparing','2026-11-01',NULL),($3,$4,'paid','2026-11-01','2026-11-01')",[stale,foreign,readyCleanup,cleanupRid,cleanupOther]);
const cleanupBefore=(await query('SELECT id,status,qr_ready_at,pickup_collected_at FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id',[[stale,foreign,readyCleanup]])).rows;
await migrateDisplays(pool);
assert((await query('SELECT pickup_display_hidden_at FROM orders WHERE id=$1',[stale])).rows[0].pickup_display_hidden_at);
for(const key of [foreign,readyCleanup])assert.equal((await query('SELECT pickup_display_hidden_at FROM orders WHERE id=$1',[key])).rows[0].pickup_display_hidden_at,null);
assert.deepEqual((await query('SELECT id,status,qr_ready_at,pickup_collected_at FROM orders WHERE id=ANY($1::uuid[]) ORDER BY id',[[stale,foreign,readyCleanup]])).rows,cleanupBefore);
await migrateDisplays(pool);
console.log('Targeted stale display cleanup preserves orders, readiness and other restaurants.');

await db.close();

import {JSDOM} from 'jsdom';import fs from 'node:fs';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {PGlite} from '@electric-sql/pglite';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');const db=new PGlite();await db.waitReady;
async function query(sql,args){if(sql.includes('CREATE TABLE')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0}}
globalThis.aiTestPg={Pool:class{query(...a){return query(...a)}async connect(){return {query,release(){}}}}};
let source=fs.readFileSync(root+'/server/ai-platform.js','utf8').replace("import {aiPool,platformPool,ensureAiDatabase,copyLegacyAiData} from './ai-database.js';","const platformPool=new globalThis.aiTestPg.Pool(); const aiPool=()=>new globalThis.aiTestPg.Pool(); const ensureAiDatabase=async()=>{}; const copyLegacyAiData=async()=>{};").replace("'./ai-policy.js'",JSON.stringify('file://'+root+'/server/ai-policy.js'));
const {handleAiPlatform,migrateAiPlatform}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const {hash,passwordHash}=await import('file://'+root+'/server/ai-policy.js');await migrateAiPlatform();
await db.exec('CREATE TABLE users(id uuid primary key,status text,must_change_password boolean);CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);CREATE TABLE platform_admins(user_id uuid,active boolean);');
const ids={buyer:crypto.randomUUID(),other:crypto.randomUUID(),supplier:crypto.randomUUID(),admin:crypto.randomUUID(),pending:crypto.randomUUID()};
for(const role of ['buyer','other','supplier','pending'])await query('INSERT INTO ai_accounts(id,email,password_hash,name,business_name,role,status,address,city) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8)',[ids[role],role+'@example.org',passwordHash('testing-password-123'),role,role==='supplier'?'wholesaler':'restaurant',role==='pending'?'pending':'active','Testweg 1','Berlin']);
await query("INSERT INTO users VALUES($1,'active',false)",[ids.admin]);await query('INSERT INTO platform_admins VALUES($1,true)',[ids.admin]);await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[hash('admin-token'),ids.admin]);
const tokens={};
async function call(path,body,token){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url:'/api/ai/'+path,method:body?'POST':'GET',headers:{authorization:token?'Bearer '+token:'','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}});let status,out;const res={writeHead(s){status=s},end(x){out=JSON.parse(x)}};assert(await handleAiPlatform(req,res));return {status,...out}}
for(const r of ['buyer','other','supplier']){const out=await call('login',{email:r+'@example.org',password:'testing-password-123'});assert.equal(out.status,200);tokens[r]=out.token}
assert.equal((await call('me',null)).status,401);assert.equal((await call('admin',null,tokens.buyer)).status,403);
const loc=(await call('locations',{name:'Testbetrieb'},tokens.buyer)).location;
assert.equal((await call('stock',{locationId:loc.id,name:'Fremde Zutat',unit:'kg',quantity:0,minimum:10},tokens.other)).status,404);
const st=(await call('stock',{locationId:loc.id,name:'Mehl',unit:'kg',quantity:2,minimum:10},tokens.buyer)).stock;
assert.equal((await call('products',{name:'Mehl',unit:'kg',packQuantity:5,priceCents:1000,minimumPacks:1},tokens.supplier)).status,201);
const offers=await call('catalog',null,tokens.buyer);assert.equal(offers.products.length,1);const product=offers.products[0];
assert.equal((await call('catalog?q=Mehl',null,tokens.buyer)).products.length,1);
const orderBody={productId:product.id,stockId:st.id,packs:2,requestKey:crypto.randomUUID(),deliveryDate:'2026-10-02',expectedNetCents:2000,confirmed:true};
assert.equal((await call('orders',orderBody,tokens.buyer)).status,409);
assert.equal((await call('admin/launch',{onboardingEnabled:true,ordersEnabled:true},'admin-token')).status,200);
assert.equal((await call('orders',{...orderBody,expectedNetCents:1},tokens.buyer)).status,400);
assert.equal((await call('orders',orderBody,tokens.other)).status,404);
const placed=await call('orders',orderBody,tokens.buyer);assert.equal(placed.status,201);assert.equal(Number(placed.order.commission_cents),40);
const duplicate=await call('orders',orderBody,tokens.buyer);assert.equal(duplicate.order.id,placed.order.id);
assert.equal((await call('orders/'+placed.order.id+'/accept',{},tokens.buyer)).status,409);
assert.equal((await call('orders/'+placed.order.id+'/receive',{},tokens.other)).status,404);
assert.equal((await call('orders/'+placed.order.id+'/accept',{},tokens.supplier)).status,200);
assert.equal((await call('orders/'+placed.order.id+'/receive',{},tokens.buyer)).status,200);
assert.equal((await call('orders/'+placed.order.id+'/receive',{},tokens.buyer)).status,200);
const after=await call('stock',null,tokens.buyer);assert.equal(Number(after.stock[0].quantity),12);
const moves=await call('stock-moves',null,tokens.buyer);assert.equal(moves.moves.filter(m=>m.reason==='Wareneingang').length,1);
assert.equal((await call('orders/'+placed.order.id+'/cancel',{},tokens.buyer)).status,409);
const second=(await call('orders',{...orderBody,requestKey:crypto.randomUUID()},tokens.buyer)).order;
assert.equal((await call('orders/'+second.id+'/cancel',{},tokens.supplier)).status,200);
assert.equal(Number((await call('orders',null,tokens.buyer)).orders.find(o=>o.id===second.id).commission_cents),0);
assert.equal((await call('stock-adjust',{id:st.id,quantity:5,minimum:10,reason:'Inventur'},tokens.other)).status,404);
assert.equal((await call('stock-adjust',{id:st.id,quantity:5,minimum:10,reason:'Inventur'},tokens.buyer)).status,200);
assert.equal((await call('admin/account',{id:ids.pending,action:'restore'},'admin-token')).status,409);
assert.equal((await call('admin/account',{id:ids.buyer,action:'suspend'},'admin-token')).status,200);
assert.equal((await call('me',null,tokens.buyer)).status,401);
assert.equal((await call('admin',null,'admin-token')).status,200);
const verification=crypto.randomBytes(32).toString('hex');await query("INSERT INTO ai_auth_tokens VALUES($1,$2,'verify',now()+interval '1 hour',NULL)",[hash(verification),ids.pending]);assert.equal((await call('verify',{token:verification})).status,200);assert.equal((await call('verify',{token:verification})).status,400);
const reset=crypto.randomBytes(32).toString('hex');await query("INSERT INTO ai_auth_tokens VALUES($1,$2,'reset',now()+interval '1 hour',NULL)",[hash(reset),ids.supplier]);assert.equal((await call('reset',{token:reset,password:'new-testing-password'})).status,200);assert.equal((await call('me',null,tokens.supplier)).status,401);assert.equal((await call('reset',{token:reset,password:'new-testing-password'})).status,400);

const markup=fs.readFileSync(root+'/apps/web/public/ai-workspace.html','utf8'),script=fs.readFileSync(root+'/apps/web/public/ai-workspace.js','utf8');
const browser=new JSDOM(markup,{url:'https://example.org/ai-workspace.html',runScripts:'outside-only'});const w=browser.window;w.HTMLElement.prototype.scrollIntoView=function(){};
w.fetch=async(path,opt={})=>{const result=await call(path.replace('/api/ai/',''),opt.body?JSON.parse(opt.body):undefined,opt.headers?.authorization?.replace('Bearer ',''));const {status,...value}=result;return {ok:status>=200&&status<300,status,json:async()=>value}};
w.eval(script);const d=w.document;
async function until(test){for(let i=0;i<150;i++){if(test())return;await new Promise(r=>setTimeout(r,10))}throw Error('UI wait timed out: '+d.getElementById('notice').textContent)}
function submit(kind,values){const form=d.querySelector('[data-form="'+kind+'"]');assert(form,'form '+kind+' exists');for(const [key,value]of Object.entries(values))form.elements.namedItem(key).value=value;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}
d.querySelector('[data-eye]').click();assert.equal(d.getElementById('password').type,'text');d.querySelector('[data-eye]').click();assert.equal(d.getElementById('password').type,'password');
d.querySelector('[data-auth="register"]').click();assert.equal(d.getElementById('role').options.length,4);d.querySelector('[data-auth="login"]').click();
submit('login',{email:'other@example.org',password:'testing-password-123'});await until(()=>d.querySelector('[data-view="stock"]'));
d.querySelector('[data-view="stock"]').click();await until(()=>d.querySelector('[data-form="location"]'));
submit('location',{name:'UI Teststandort',address:'UI Weg 1'});await until(()=>d.querySelector('#locationId option'));
submit('stock',{name:'UI Mehl',quantity:'0',minimum:'5'});await until(()=>d.querySelector('[data-adjust]'));
d.querySelector('[data-view="catalog"]').click();await until(()=>d.querySelector('[data-form="search"]'));
submit('search',{q:'Mehl'});await until(()=>d.querySelector('[data-buy]'));assert.equal(d.getElementById('search').value,'Mehl');
d.querySelector('[data-buy]').click();const buy=d.querySelector('[data-form="buy"]');buy.elements.namedItem('confirmed').checked=true;submit('buy',{packs:'2',deliveryDate:'2026-10-02'});await until(()=>d.querySelector('[data-cancel]'));assert.match(d.getElementById('content').textContent,/Gesendet/);
w.close();console.log('DOM workflow passed: eye, role registration, login, location, stock, catalog search and order submission.');
console.log('Embedded PostgreSQL integration passed: migrations, tenant isolation, catalog, order locks/idempotency, stock receipt, cancellation, admin suspension, verification and reset.');await db.close();

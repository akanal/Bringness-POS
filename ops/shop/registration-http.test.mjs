import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';import {Readable} from 'node:stream';import {createRequire} from 'node:module';
import {fixture} from './fixture.mjs';import {dependency} from './dependency.mjs';import {createShopRegistrationRuntime} from '../../server/shop-registration-http.js';import {createShopRegistrationLimiter} from '../../server/shop-registration-limiter.js';import {requestShopRegistration} from '../../apps/web/public/shop/registration-client.js';import {mountShopRegistration} from '../../apps/web/public/shop/registration-ui.js';
const origin='https://fixture.example.test',registration={companyName:'Fixture Shop',ownerName:'Fixture Owner',email:'new@example.test',password:'Valid1!',street:'Example 1',postalCode:'10115',city:'Berlin',country:'DE'};
async function setup(){const f=await fixture();await f.db.exec("ALTER TABLE companies ADD COLUMN name text;ALTER TABLE users ADD COLUMN password_hash text;ALTER TABLE company_billing_profiles ADD COLUMN contact_name text;UPDATE users SET email=id::text||'@fixture.test';CREATE UNIQUE INDEX shop_http_email_unique ON users(email);");const runtime=createShopRegistrationRuntime(f.pool,{enabled:true,publicOrigin:origin,limiter:createShopRegistrationLimiter({limit:100,globalLimit:200})});await runtime.migrate();const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {...f,runtime,base:`http://127.0.0.1:${server.address().port}`,async close(){await new Promise(r=>server.close(r));await f.db.close();}};}
test('registration runtime defaults off and validates origin only when enabled',async()=>{
 const runtime=createShopRegistrationRuntime({query(){assert.fail('disabled database');}});await runtime.migrate();assert.equal(await runtime.handle({url:'invalid'},{}),false);
 for(const publicOrigin of [undefined,'http://fixture.test','https://user:pass@fixture.test','https://fixture.test/path','https://fixture.test?x=1','https://fixture.test:444'])assert.throws(()=>createShopRegistrationRuntime({}, {enabled:true,publicOrigin}),/INVALID_REGISTRATION_ORIGIN/);
});
test('admission budgets are bounded, preserve active limits and expire without forwarded-header trust',()=>{
 let now=0;const limiter=createShopRegistrationLimiter({limit:2,windowMs:10000,maxKeys:2,globalLimit:10,globalWindowMs:1000,now:()=>now});assert.equal(limiter.admit('a').allowed,true);assert.equal(limiter.admit('a').allowed,true);assert.equal(limiter.admit('a').allowed,false);assert.equal(limiter.admit('b').allowed,true);assert.equal(limiter.admit('c').allowed,false);assert.equal(limiter.admit('a').allowed,false);now=10001;assert.equal(limiter.admit('c').allowed,true);
 const global=createShopRegistrationLimiter({limit:10,globalLimit:1,globalWindowMs:1000,now:()=>now});assert.equal(global.admit('a').allowed,true);assert.equal(global.admit('b').allowed,false);now+=1001;assert.equal(global.admit('b').allowed,true);
});
test('real HTTP registration enforces origin method body limits and sanitized failures before writes',async()=>{
 const f=await setup();try{
  const post=(body,headers={},suffix='')=>fetch(f.base+'/api/v1/shop/registrations'+suffix,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json; charset=utf-8',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  assert.equal((await fetch(f.base+'/api/v1/shop/registrations')).status,405);
  for(const headers of [{Origin:''},{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await post({},headers)).status,403);
  assert.equal((await post({}, {},'?next=https://evil.test')).status,403);assert.equal((await post({}, {'Content-Type':'text/plain'})).status,400);
  for(const raw of ['[]','{','{"requestId":"bad","registration":{}}','{"requestId":"bad","registration":{},"role":"admin"}'])assert.equal((await post(raw)).status,400);
  assert.equal((await post('x'.repeat(17000))).status,413);
  const utf=await fetch(f.base+'/api/v1/shop/registrations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:Buffer.from([0xff])});assert.equal(utf.status,400);
  assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM companies')).rows.length,2);
  const disabled=createShopRegistrationRuntime({}, {enabled:true,publicOrigin:origin}),res={writeHead(s){this.status=s;},end(){}};await disabled.handle({url:'/api/v1/shop/registrations',method:'POST',headers:{origin}},res);assert.equal(res.status,503);
 }finally{await f.close();}
});
test('form→real HTTP→atomic registration preserves cart and recovers a lost reply without duplicate accounts',async()=>{
 const f=await setup(),require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),dom=new JSDOM('<div id="host"></div>',{url:origin+'/shop/register.html#review',pretendToBeVisual:true}),w=dom.window,host=w.document.getElementById('host');let posts=0,drop=true,finish;let done=new Promise(r=>finish=r),ui;const id=crypto.randomUUID();
 const fetcher=async(url,options)=>{posts++;const result=await fetch(f.base+url,{...options,headers:{...options.headers,Origin:origin}});if(drop&&result.ok){drop=false;await result.arrayBuffer();throw Error('private lost reply');}return result;};
 try{w.sessionStorage.setItem('bringness.shop.cart.v2','{"pos-online":1}');ui=mountShopRegistration({host,hash:'#review',newId:()=>id,request:async r=>{try{return await requestShopRegistration({...r,fetcher});}finally{finish();}}});
  const send=()=>{for(const [k,v] of Object.entries(registration))host.querySelector('[name='+k+']').value=v;host.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));};
  send();await done;await new Promise(r=>setTimeout(r,10));assert.equal(host.querySelector('a').hidden,true);assert.equal(posts,1);assert.ok(!host.textContent.includes('private'));assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,1);
  done=new Promise(r=>finish=r);send();await done;await new Promise(r=>setTimeout(r,10));assert.equal(posts,2);assert.equal(host.querySelector('a').hidden,false);assert.equal(host.querySelector('a').getAttribute('href'),'/shop/account.html#review');assert.equal((await f.db.query('SELECT 1 FROM companies')).rows.length,3);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.getItem('bringness.shop.cart.v2'),'{"pos-online":1}');
  const user=(await f.db.query('SELECT id FROM users WHERE email=$1',[registration.email])).rows[0];assert.equal((await f.db.query('SELECT 1 FROM sessions WHERE user_id=$1',[user.id])).rows.length,0);for(const table of ['billing_transactions','company_entitlements','company_features'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
 }finally{ui?.dispose();w.close();await f.close();}
});
test('HTTP limiter keys the socket, ignores spoofed forwarding, and returns a bounded retry hint',async()=>{
 const f=await setup();try{const runtime=createShopRegistrationRuntime(f.pool,{enabled:true,publicOrigin:origin,limiter:createShopRegistrationLimiter({limit:1})});await runtime.migrate();
  async function send(forward){const req=Readable.from(['{}']);Object.assign(req,{url:'/api/v1/shop/registrations',method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-for':forward},socket:{remoteAddress:'127.0.0.1'}});const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s){this.status=s;},end(b){this.body=b;}};await runtime.handle(req,res);return res;}
  assert.equal((await send('1.2.3.4')).status,400);const limited=await send('9.8.7.6');assert.equal(limited.status,429);assert.equal(JSON.parse(limited.body).code,'REGISTRATION_LIMIT');assert.ok(Number(limited.headers['Retry-After'])>0);assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,0);
 }finally{await f.close();}
});
test('client rejects grant-shaped receipts and arbitrary network diagnostics',async()=>{
 const requestId=crypto.randomUUID(),base={version:1,requestId,recorded:true,replay:false,loginRequired:true,canPay:false,canActivate:false,checkoutConnected:false};for(const patch of [{canActivate:true},{requestId:crypto.randomUUID()},{replay:'yes'},{loginRequired:false}])await assert.rejects(requestShopRegistration({requestId,registration,fetcher:async()=>Response.json({...base,...patch})}),{code:'REGISTRATION_UNAVAILABLE'});
 await assert.rejects(requestShopRegistration({requestId,registration,fetcher:async()=>{throw Error('private password');}}),e=>e.code==='REGISTRATION_UNAVAILABLE'&&!e.message.includes('password'));
});

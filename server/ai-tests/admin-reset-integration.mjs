import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Readable} from 'node:stream';import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url).pathname.replace(/\/$/,'');const db=new PGlite();await db.waitReady;
await db.exec('CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,email text,role text,status text,password_hash text,must_change_password boolean);CREATE TABLE password_reset_tokens(token_hash text PRIMARY KEY,user_id uuid,created_at timestamptz DEFAULT now(),expires_at timestamptz,used_at timestamptz);CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);CREATE TABLE audit_log(company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id uuid);');
const query=async(...args)=>{const r=await db.query(...args);return {...r,rowCount:r.rows.length||r.affectedRows||0}};globalThis.resetTestPool={query,async connect(){return {query,release(){}}}};
let messages=[],failMail=true;globalThis.resetTestMail=async message=>{if(failMail)throw Object.assign(Error('blocked'),{code:'ETIMEDOUT'});messages.push(message)};
let source=fs.readFileSync(root+'/server/admin-password-reset.js','utf8').replace("import {sendSmtpMail} from './smtp-mail.js';","const sendSmtpMail=(...args)=>globalThis.resetTestMail(...args);").replace("import {createMailProbe} from './ai-mail-health.js';","const createMailProbe=()=>async()=>({available:true,status:'ready'});").replace('import pg from "pg";','').replace(/const pool=new pg.Pool\([\s\S]*?\n\}\);/,'const pool=globalThis.resetTestPool;').replace("'./auth-attempts.js'",JSON.stringify('file://'+root+'/server/auth-attempts.js')).replace('"./password-policy.js"',JSON.stringify('file://'+root+'/server/password-policy.js'));
const {handleAdminPasswordReset,requireAdminPasswordChange}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
for(const path of ['/api/v1/auth/forgot-password','/api/v1/auth/reset-password','/api/v1/auth/reset-password/details'])assert.equal(await requireAdminPasswordChange({url:path,headers:{authorization:'Bearer old-admin-token'}},{}),false);
Object.assign(process.env,{SMTP_HOST:'test',SMTP_USER:'test',SMTP_PASSWORD:'test',SMTP_FROM:'test@example.org',PUBLIC_BASE_URL:'https://pos.example.org',AI_PUBLIC_BASE_URL:'https://ai.example.org'});
const admin=crypto.randomUUID(),waiter=crypto.randomUUID();await query("INSERT INTO users VALUES($1,$1,'admin@example.org','admin','active','old',true),($2,$2,'waiter@example.org','waiter','active','old',false)",[admin,waiter]);await query("INSERT INTO sessions VALUES('old-session',$1,now()+interval '1 hour')",[admin]);
async function call(path,input){const req=Readable.from(input?[JSON.stringify(input)]:[]);Object.assign(req,{url:path.startsWith('/')?path:'/api/v1/admin/password/'+path,method:input?'POST':'GET',headers:{}});let status,data;assert(await handleAdminPasswordReset(req,{writeHead(value){status=value},end(value){data=JSON.parse(value)}}));return {status,...data}}
assert.equal((await call('forgot',{email:'admin@example.org',returnTo:'ai'})).status,503);assert.equal((await query('SELECT * FROM password_reset_tokens')).rows.length,0);
failMail=false;assert.equal((await call('forgot',{email:'ADMIN@example.org',returnTo:'ai'})).status,200);assert.equal(messages.length,1);assert.match(messages[0].html,/Neues Passwort festlegen/);assert.match(messages[0].text,/https:\/\/ai.example.org\/admin\/reset.html\?returnTo=ai#token=/);
await call('forgot',{email:'admin@example.org'});assert.equal(messages.length,1);await call('forgot',{email:'waiter@example.org'});await call('forgot',{email:'unknown@example.org'});assert.equal(messages.length,1);
const token=messages[0].text.match(/#token=([a-f0-9]{64})/)[1];assert.equal((await call('reset',{token,password:'weak'})).status,400);assert.equal((await call('reset',{token,password:'Ab1!xy'})).status,200);assert.equal((await query('SELECT * FROM sessions')).rows.length,0);assert.equal((await query('SELECT must_change_password FROM users WHERE id=$1',[admin])).rows[0].must_change_password,false);assert.equal((await call('reset',{token,password:'Ab2!xy'})).status,400);assert.equal((await query('SELECT * FROM audit_log')).rows.length,1);
await query("UPDATE password_reset_tokens SET used_at=NULL,expires_at=now()-interval '1 minute'");assert.equal((await call('reset',{token,password:'Ab2!xy'})).status,400);
const owner=crypto.randomUUID();await query("INSERT INTO users VALUES($1,$1,'Owner@Example.org','owner','active','old',false)",[owner]);await query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES('old-placeholder',$1,now()+interval '30 minutes')",[owner]);
const before=messages.length;assert.equal((await call('/api/v1/auth/forgot-password',{email:'OWNER@example.org'})).status,200);assert.equal(messages.length,before+1);assert.match(messages.at(-1).text,/https:\/\/pos.example.org\/admin\/reset.html\?returnTo=pos#token=/);assert(!messages.at(-1).subject.includes('Admin'));
const ownerToken=messages.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];assert.equal((await call('reset',{token:ownerToken,password:'Ab1!xy'})).status,200);
// Owners may use the stricter admin reset path; customer roles cannot.
const customer=crypto.randomUUID();await query("INSERT INTO users VALUES($1,$1,'customer@example.org','customer','active','old',false)",[customer]);await call('/api/v1/auth/forgot-password',{email:'customer@example.org'});const customerToken=messages.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];assert.equal((await call('reset',{token:customerToken,password:'Ab1!xy'})).status,400);
const {loginAttempts}=await import('file://'+root+'/server/auth-attempts.js');const key=crypto.createHash('sha256').update('customer@example.org').digest('hex');loginAttempts.set(key,{count:5,until:Date.now()+900000});assert.equal((await call('/api/v1/auth/reset-password',{token:customerToken,password:'Ab1!xy'})).status,200);assert(!loginAttempts.has(key));assert.equal((await call('/api/v1/auth/reset-password',{token:customerToken,password:'Ab2!xy'})).status,400);
const count=messages.length;await call('/api/v1/auth/forgot-password',{email:'unknown@example.org'});assert.equal(messages.length,count);
assert.equal((await call('/api/v1/auth/forgot-password',{email:'bad'})).status,400);
// The real POS login route accepts case-normalized legacy emails and honors the reset-unlocked limiter.
await query("ALTER TABLE users ADD COLUMN display_name text DEFAULT 'Test Owner'");
const loginSource=fs.readFileSync(root+'/server/index.js','utf8').split('\n').find(line=>line.startsWith('if(p==="/api/v1/auth/login"'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;const runLogin=new AsyncFunction('p','req','res','body','pool','hash','json','session','loginAttempts','crypto',loginSource);
const passwordHash=value=>crypto.scryptSync(value,process.env.PASSWORD_PEPPER||'bringness-pos',64).toString('hex');
await query('UPDATE users SET password_hash=$2 WHERE id=$1',[owner,passwordHash('Ab1!xy')]);
async function login(email,password){let reply;await runLogin('/api/v1/auth/login',{method:'POST'}, {},async()=>({email,password}),{query},passwordHash,(_,status,data)=>{reply={status,...data}},async()=> 'test-session',loginAttempts,crypto);return reply;}
assert.equal((await login(' OWNER@example.org ','Ab1!xy')).status,200);for(let n=0;n<5;n++)assert.equal((await login('owner@example.org','wrong')).status,401);assert.equal((await login('owner@example.org','Ab1!xy')).status,429);
await query("UPDATE password_reset_tokens SET delivered_at=now()-interval '3 minutes',created_at=now()-interval '3 minutes' WHERE user_id=$1",[owner]);await call('/api/v1/auth/forgot-password',{email:'OWNER@example.org'});const freshToken=messages.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];assert.equal((await call('/api/v1/auth/reset-password',{token:freshToken,password:'Ab2!xy'})).status,200);assert.equal((await login('owner@example.org','Ab2!xy')).status,200);assert.equal((await login('owner@example.org','Ab1!xy')).status,401);

// Every staff role recovers its own credential without acquiring another role.
for(const role of ['waiter','cashier','kitchen','manager','admin','owner']){
  const email=role+'-staff@example.org',id=crypto.randomUUID();
  await query("INSERT INTO users(id,company_id,email,role,status,password_hash,must_change_password) VALUES($1,$1,$2,$3,'active',$4,true)",[id,email,role,passwordHash('Old1!x')]);
  await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",['session-'+role,id]);
  await call('/api/v1/auth/forgot-password',{email});
  const raw=messages.at(-1).text.match(/#token=([a-f0-9]{64})/)[1],pin=role==='waiter';
  assert(messages.at(-1).text.includes('?returnTo='+(pin?'service':'pos')));
  const details=await call('/api/v1/auth/reset-password/details',{token:raw});
  assert.equal(details.status,200);assert.equal(details.credentialType,pin?'pin':'password');assert.equal(details.loginPath,pin?'/service/':'/pos/');
  assert.equal((await call('/api/v1/auth/reset-password',{token:raw,password:pin?'Ab1!xy':'123456'})).status,400);
  assert.equal((await call('reset',{token:raw,password:'123456'})).status,400);
  const next=pin?'047293':'New2!x';
  assert.equal((await call('/api/v1/auth/reset-password',{token:raw,password:next})).status,200);
  assert.equal((await login(email,next)).status,200);assert.equal((await login(email,'Old1!x')).status,401);
  assert.equal((await query('SELECT role,must_change_password FROM users WHERE id=$1',[id])).rows[0].role,role);
  assert.equal((await query('SELECT must_change_password FROM users WHERE id=$1',[id])).rows[0].must_change_password,false);
  assert.equal((await query('SELECT * FROM sessions WHERE user_id=$1',[id])).rows.length,0);
  assert.equal((await call('/api/v1/auth/reset-password/details',{token:raw})).status,400);
  assert.equal((await call('/api/v1/auth/reset-password',{token:raw,password:next})).status,400);
}
const inactive=crypto.randomUUID();await query("INSERT INTO users(id,company_id,email,role,status,password_hash,must_change_password) VALUES($1,$1,'inactive@example.org','waiter','pending','old',true)",[inactive]);
const beforeInactive=messages.length;await call('/api/v1/auth/forgot-password',{email:'inactive@example.org'});assert.equal(messages.length,beforeInactive);
assert.equal((await call('/api/v1/auth/reset-password/details',{token:'invalid'})).status,400);
assert.equal((await call('/api/v1/auth/reset-password/details',{token:'a'.repeat(64)})).status,400);
// A issued token stops working when the account is deactivated or the token expires.
await query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[crypto.createHash('sha256').update('b'.repeat(64)).digest('hex'),inactive]);
assert.equal((await call('/api/v1/auth/reset-password/details',{token:'b'.repeat(64)})).status,400);
await query("UPDATE users SET status='active' WHERE id=$1",[inactive]);await query("UPDATE password_reset_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[inactive]);
assert.equal((await call('/api/v1/auth/reset-password/details',{token:'b'.repeat(64)})).status,400);
assert.equal((await call('/api/v1/auth/reset-password',{token:'b'.repeat(64),password:'123456'})).status,400);
const {JSDOM}=await import('jsdom');
for(const pin of [false,true]){
  const browser=new JSDOM(fs.readFileSync(root+'/apps/web/public/admin/reset.html','utf8'),{url:'https://pos.example.org/admin/reset.html?returnTo=pos#token='+'a'.repeat(64),runScripts:'outside-only'}).window;
  let resetPost;browser.localStorage.setItem('bringness-waiter-token','old');
  browser.fetch=async(url,options)=>{if(url.endsWith('/details'))return {ok:true,json:async()=>({credentialType:pin?'pin':'password',loginPath:pin?'/service/':'/pos/'})};resetPost={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({message:'Zugang geändert.'})}};
  // Match the production logo helper, which replaces the brand span before reset initialization.
  browser.document.querySelector('.brand').innerHTML='<img alt="Bringness">';
  browser.eval(browser.document.querySelector('script').textContent);await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(browser.document.querySelector('a[href="'+(pin?'/service/':'/pos/')+'"]').textContent,pin?'Zur Service-Anmeldung':'Zur Kassen-Anmeldung');assert.equal(browser.location.hash,'');
  const value=pin?'047293':'Ab1!xy';browser.document.getElementById('newPassword').value=value;browser.document.getElementById('repeatPassword').value=value;
  assert(browser.document.getElementById('resetForm').checkValidity());
  for(const id of ['newPassword','repeatPassword']){const field=browser.document.getElementById(id),eye=browser.document.querySelector('[data-password-eye="'+id+'"]');assert(eye);eye.click();assert.equal(field.type,'text');assert.equal(field.value,value);assert.equal(eye.getAttribute('aria-pressed'),'true');eye.click();assert.equal(field.type,'password');assert.equal(field.value,value);}
  if(pin){assert.equal(browser.document.getElementById('newPassword').inputMode,'numeric');assert.equal(browser.document.getElementById('newPassword').maxLength,6);}
  browser.document.getElementById('resetForm').dispatchEvent(new browser.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(resetPost.url,'/api/v1/auth/reset-password');assert.equal(resetPost.body.password,value);assert.equal(browser.localStorage.getItem('bringness-waiter-token'),null);browser.close();
}
// A forgotten code can be requested without entering the old credential.
const service=new JSDOM(fs.readFileSync(root+'/apps/web/public/service/index.html','utf8'),{url:'https://pos.example.org/service/',runScripts:'outside-only'}).window;
let request;service.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({message:'Bitte prüfe auch den Spamordner.'})}};
service.eval(fs.readFileSync(root+'/apps/web/public/service/app.js','utf8'));
service.document.getElementById('email').value='waiter@example.org';service.document.getElementById('forgotPassword').click();await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(request.url,'/api/v1/auth/forgot-password');assert.deepEqual(request.body,{email:'waiter@example.org'});assert.match(service.document.getElementById('loginMsg').textContent,/Spamordner/);assert.equal(service.document.getElementById('forgotPassword').disabled,false);service.close();
await db.close();
console.log('Staff recovery passed: all six roles, role-specific PIN/password policy, new credential login, session revocation, unchanged roles, inactive/expired/reused rejection, service request and reset phone UI.');

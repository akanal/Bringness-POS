import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {JSDOM} from 'jsdom';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const loginSource=read('server/index.js').split('\n').find(x=>x.startsWith('if(p==="/api/v1/auth/login"'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('p','req','res','body','pool','hash','json','session','loginAttempts','crypto',loginSource);
const attempts=new Map();let queries=0;
async function login(password,email='Owner@example.org'){let reply;await run('/api/v1/auth/login',{method:'POST'},{},async()=>({email,password}),{query:async(sql,args)=>{queries++;return {rows:args[1]==='correct'?[{id:'owner',display_name:'Owner'}]:[]}}},v=>v,(_,status,data)=>reply={status,...data},async()=>'session',attempts,crypto);return reply}
assert.equal((await login('')).status,400);assert.equal(queries,0);
for(let i=0;i<25;i++)assert.equal((await login('wrong')).status,401);
assert.equal((await login('correct')).status,200);
const key=crypto.createHash('sha256').update('owner@example.org').digest('hex');assert(!attempts.has(key));
attempts.set(key,{count:0,until:Date.now()+900000,blockedUntil:Date.now()+300000,level:4});
assert.equal((await login('correct')).status,200);assert(!attempts.has(key));
const w=new JSDOM(read('apps/web/public/pos/index.html'),{url:'https://pos.example.org/pos/',runScripts:'outside-only'}).window;w.console.error=()=>{};
let release,posts=0;w.fetch=async(url)=>{if(!url.includes('/auth/login'))return {ok:true,status:200,json:async()=>({})};posts++;return new Promise(resolve=>release=()=>resolve({ok:false,status:401,json:async()=>({error:'Anmeldedaten stimmen nicht'})}))};w.eval(read('apps/web/public/pos/app.js'));const d=w.document,form=d.getElementById('authForm');d.getElementById('email').value='owner@example.org';d.getElementById('password').value='wrong';
form.dispatchEvent(new w.Event('submit',{cancelable:true}));form.dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(posts,1);assert(d.getElementById('authSubmit').disabled);d.getElementById('registerTab').click();assert.equal(d.getElementById('nameField').style.display,'none');release();await new Promise(r=>setTimeout(r,0));assert(!d.getElementById('authSubmit').disabled);assert.equal(d.getElementById('authMsg').textContent,'Anmeldedaten stimmen nicht');d.getElementById('registerTab').click();assert(d.getElementById('name').required);assert.equal(d.getElementById('authSubmit').textContent,'Konto erstellen');d.getElementById('loginTab').click();assert(!d.getElementById('name').required);assert(!d.getElementById('password').hasAttribute('pattern'));d.getElementById('togglePassword').click();assert.equal(d.getElementById('password').type,'text');
w.fetch=async(url)=>{if(url.includes('/auth/login'))return {ok:true,status:200,json:async()=>({token:'valid-session',user:{role:'owner'}})};throw Error('network')};form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(w.localStorage.getItem('bringness-pos-token'),'valid-session');assert.match(d.getElementById('authMsg').textContent,/Verbindung/);w.close();console.log('POS authentication passed: validation, normalized login, unlimited sequential retries, obsolete cooldown ignored, duplicate submit guard, register/login switching, password visibility and session preservation on network failure.');
const recovery=new JSDOM(read('apps/web/public/pos/index.html'),{url:'https://pos.example.org/pos/',runScripts:'outside-only'}).window;
let resolveMail,mailRequests=0;const timeouts=[];const timer=recovery.setTimeout.bind(recovery);recovery.setTimeout=(fn,ms)=>{timeouts.push(ms);return timer(fn,ms)};
recovery.fetch=async(url)=>{assert.equal(url,'/api/v1/auth/forgot-password');mailRequests++;return new Promise(resolve=>{resolveMail=()=>resolve({ok:true,status:200,json:async()=>({message:'Reset-Link angefordert.'})})})};
recovery.eval(read('apps/web/public/pos/app.js'));recovery.document.getElementById('email').value='owner@example.org';
const resetButton=recovery.document.getElementById('forgotPassword');resetButton.click();resetButton.click();assert.equal(mailRequests,1);assert(resetButton.disabled);assert(timeouts.includes(60000));assert.match(recovery.document.getElementById('authMsg').textContent,/Bitte kurz warten/);
resolveMail();await new Promise(resolve=>setTimeout(resolve,0));assert(!resetButton.disabled);assert.equal(recovery.document.getElementById('authMsg').textContent,'Reset-Link angefordert.');recovery.close();console.log('POS recovery UI: one request while mail pending, 60-second timeout, visible progress and confirmation passed.');

// Startup ignores old view URLs; first-click article navigation beats late responses.
for(const suffix of ['?view=lizenz','?view=einstellungen','?payment=return']){
 const d=new JSDOM(read('apps/web/public/pos/index.html'),{runScripts:'outside-only',url:'https://pos.test/pos/'+suffix}),v=d.window;
 v.Headers=Headers;v.AbortController=AbortController;v.alert=()=>{};v.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='yes'};v.localStorage.setItem('bringness-pos-token','fixture');
 const features={pos_base:true,personnel:true,table_management:true,kitchen:true};
 v.fetch=async url=>({ok:true,status:200,json:async()=>String(url).includes('/bootstrap')?{user:{name:'Owner'},restaurants:[{id:'r1',name:'Shop',mode:'restaurant'}],categories:[],products:[],orders:[]}:String(url).includes('/billing/status')?{features}:String(url).endsWith('/personnel/access')?{configured:true,canManage:true}:{}});
 v.eval(read('apps/web/public/pos/app.js'));v.eval(read('apps/web/public/pos/personnel.js'));
 const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(r=>setTimeout(r,10))}throw Error('Navigation fixture timeout')};
 try{
  await wait(()=>v.document.getElementById('who').textContent==='Owner');await new Promise(r=>setTimeout(r,0));assert.equal(v.document.body.dataset.posView,'kasse');assert.equal(v.document.querySelector('.personnel-overlay'),null);
  v.document.querySelector('[data-view=artikel]').click();assert.equal(v.document.body.dataset.posView,'artikel');assert.equal(v.document.querySelector('.artikelmanage').style.display,'block');assert.equal(v.document.querySelector('.artikelmanage').dataset.scrolled,'yes');assert(!v.document.getElementById('moduleView').classList.contains('show'));
  await v.showModule('personalmanagement');assert.equal(v.document.querySelector('.personnel-overlay'),null);
  const settings=v.showModule('einstellungen');await wait(()=>v.document.querySelector('.personnel-overlay'));v.document.querySelector('.personnel-overlay [data-close]').click();await settings;assert.equal(v.document.body.dataset.posView,'personalmanagement');
  let finish;const fetch=v.fetch;v.fetch=(url,opt)=>String(url).endsWith('/billing/status')?new Promise(resolve=>finish=()=>resolve({ok:true,status:200,json:async()=>({features})})):fetch(url,opt);
  const stale=v.showModule('tische');await wait(()=>finish);await v.showModule('artikel');finish();await stale;assert.equal(v.document.body.dataset.posView,'artikel');
 }finally{v.close()}
}
console.log('POS navigation passed: Kasse startup for stale URLs/payment returns, first-click article form, PIN only for Settings navigation and stale table response cannot replace Article.');

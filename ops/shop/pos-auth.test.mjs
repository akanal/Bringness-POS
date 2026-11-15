import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../../apps/web/public/pos/index.html',import.meta.url),'utf8'),source=await readFile(new URL('../../apps/web/public/pos/auth.js',import.meta.url),'utf8'),app=await readFile(new URL('../../apps/web/public/pos/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){const dom=new JSDOM(html,{url:'https://pos.test/pos/',runScripts:'outside-only'}),w=dom.window;const run=code=>new vm.Script(code).runInContext(dom.getInternalVMContext());run(source);w.document.getElementById('email').value='owner@example.test';w.document.getElementById('password').value='synthetic';return {dom,w,run,el:id=>w.document.getElementById(id)};}
const ok=result=>({ok:true,status:200,json:async()=>result});
test('an unloaded authentication script cannot turn the password form into a GET URL',()=>{
 const dom=new JSDOM(html);try{const form=dom.window.document.getElementById('authForm');assert.equal(form.method,'post');assert(form.querySelector('#authSubmit').disabled);assert(form.querySelector('#forgotPassword').disabled);assert.match(form.querySelector('#authMsg').textContent,/geladen/);assert(html.indexOf('/pos/auth.js?')<html.indexOf('/pos/app.js?'));}finally{dom.window.close();}
});
test('recovery remains functional after the complete register script fails to parse',async()=>{
 const f=setup();try{assert.throws(()=>f.run('const = broken register script'),SyntaxError);await tick();assert.match(f.el('authMsg').textContent,/POS-START/);let count=0;f.w.localStorage.setItem('bringness-pos-token','obsolete');f.w.fetch=async(url,opt)=>{count++;assert.equal(url,'/api/v1/auth/forgot-password');assert.equal(opt.credentials,'omit');assert.equal(opt.headers.authorization,undefined);return ok({message:'Reset-Link angefordert.'});};f.el('forgotPassword').click();await tick();assert.equal(count,1);assert.equal(f.el('authMsg').textContent,'Reset-Link angefordert.');assert(!f.el('forgotPassword').disabled);}finally{f.w.close();}
});
test('failed logins show the server error, do not reload and allow another attempt',async()=>{
 const f=setup();try{let count=0;f.w.fetch=async()=>{count++;return {ok:false,status:401,json:async()=>({error:'E-Mail oder Passwort stimmen nicht.'})};};let prevented=false;const event=new f.w.Event('submit',{cancelable:true});f.el('authForm').dispatchEvent(event);prevented=event.defaultPrevented;await tick();assert(prevented);assert.match(f.el('authMsg').textContent,/stimmen nicht/);assert(!f.el('authSubmit').disabled);f.el('authForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();assert.equal(count,2);}finally{f.w.close();}
});
test('both hanging fetch and hanging JSON release busy controls at their deadline',async()=>{
 for(const hangBody of [false,true]){const f=setup();try{let expire;f.w.setTimeout=(fn,ms)=>{assert.equal(ms,60000);expire=fn;return 1;};f.w.clearTimeout=()=>{};f.w.fetch=()=>hangBody?Promise.resolve({ok:true,json:()=>new Promise(()=>{})}):new Promise(()=>{});f.el('forgotPassword').click();await tick();assert(f.el('forgotPassword').disabled);expire();await tick();assert.match(f.el('authMsg').textContent,/dauert zu lange/);assert(!f.el('forgotPassword').disabled);assert(!f.el('authSubmit').disabled);}finally{f.w.close();}}
});
test('empty recovery confirmations and invalid login responses never silently succeed',async()=>{
 const f=setup();try{f.w.fetch=async()=>ok({});f.el('forgotPassword').click();await tick();assert.match(f.el('authMsg').textContent,/Serverbestätigung fehlt/);f.el('authForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();assert.match(f.el('authMsg').textContent,/Anmeldebestätigung fehlt/);assert.equal(f.w.localStorage.getItem('bringness-pos-token'),null);}finally{f.w.close();}
});
test('login opens the register in memory even if Safari refuses local storage',async()=>{
 const f=setup();try{Object.defineProperty(f.w,'localStorage',{get(){throw Error('Storage denied');}});let accepted;f.w.bnPosAuth.connect(async result=>{accepted=result.token;});f.w.fetch=async()=>ok({token:'synthetic-session',user:{role:'owner'}});f.el('authForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();assert.equal(accepted,'synthetic-session');assert(!f.el('authSubmit').disabled);}finally{f.w.close();}
});
test('an expired initial bootstrap cannot erase a newer successful login',async()=>{
 const f=setup();try{f.w.console.error=()=>{};f.w.localStorage.setItem('bringness-pos-token','expired');let rejectOld;
 const bootstrap={user:{name:'Fixture'},restaurants:[],categories:[],products:[],orders:[]};
 f.w.fetch=async(url,opt)=>{
  if(url.endsWith('/auth/login'))return ok({token:'fresh-session',user:{role:'owner'}});
  if(url.endsWith('/bootstrap')&&opt.headers.authorization==='Bearer expired')return new Promise(resolve=>{rejectOld=()=>resolve({ok:false,status:401,json:async()=>({error:'Alte Sitzung abgelaufen'})});});
  if(url.endsWith('/bootstrap'))return ok(bootstrap);
  if(url.endsWith('/billing/status'))return ok({features:{pos_base:true}});
  return ok({});
 };
 f.run(app);f.el('authForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();await tick();assert(f.el('workspace').classList.contains('show'));rejectOld();await tick();assert(f.el('workspace').classList.contains('show'));assert.equal(f.w.localStorage.getItem('bringness-pos-token'),'fresh-session');assert.equal(f.el('who').textContent,'Fixture');}finally{f.w.close();}
});

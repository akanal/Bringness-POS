import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const html=await readFile(new URL('../../apps/web/public/superadmin/security.html',import.meta.url),'utf8'),script=await readFile(new URL('../../apps/web/public/superadmin/security.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,10));
async function fixture({activation='success',shortTimeout=false}={}){
 const dom=new JSDOM(html,{url:'https://bringness.de/superadmin/security.html?from=market',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,requests=[];let enabled=false,lastScroll;
 w.localStorage.setItem('bringness-market-admin-token','a'.repeat(64));w.HTMLElement.prototype.scrollIntoView=function(){lastScroll=this.id};
 if(shortTimeout){const set=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>set(fn,ms===20000?30:ms,...args)}
 w.fetch=async(url,options={})=>{
  const action=url.split('/').at(-1),body=options.body?JSON.parse(options.body):null;requests.push({action,body});
  if(action==='status')return Response.json({enabled,recoveryRemaining:enabled?10:0,setupAvailable:true,recentRecovery:false});
  if(action==='begin')return Response.json({enrollment:'e'.repeat(64),secret:'SYNTHETIC',qr:'data:image/png;base64,AA==',recoveryCodes:Array(10).fill('synthetic-code')});
  if(action==='activate'){
   if(activation==='reject')return Response.json({error:'Der Code ist ungültig oder wurde bereits verwendet.'},{status:400});
   if(activation==='timeout')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
   enabled=true;if(activation==='lost')throw new TypeError('lost response');return Response.json({enabled:true});
  }
  throw Error('Unexpected test request');
 };
 w.eval(script);await tick();
 const by=id=>doc.getElementById(id),submit=id=>by('loginForm').dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,bubbles:true,submitter:by(id)}));
 return {w,by,submit,requests,get lastScroll(){return lastScroll},async begin(){by('loginForm').elements.password.value='synthetic-password';submit('begin');await tick();assert.equal(by('enrollment').hidden,false)},close(){w.dispatchEvent(new w.Event('pagehide'));w.close()}};
}
test('activation cannot silently stop at native password validation, missing backup confirmation or malformed code',async()=>{
 const f=await fixture();try{assert.equal(f.by('loginForm').noValidate,true);await f.begin();f.by('loginForm').elements.password.value='';f.submit('activate');assert.match(f.by('form-feedback').textContent,/Passwort erneut/);assert.equal(f.lastScroll,'form-feedback');assert.equal(f.requests.filter(r=>r.action==='activate').length,0);
 f.by('loginForm').elements.password.value='synthetic-password';f.submit('activate');assert.match(f.by('activation-feedback').textContent,/Wiederherstellungscodes sicher gespeichert/);assert.equal(f.lastScroll,'activation-feedback');
 f.by('saved').checked=true;f.by('activation-code').value='12345';f.submit('activate');assert.match(f.by('activation-feedback').textContent,/sechsstelligen/);assert.equal(f.requests.filter(r=>r.action==='activate').length,0);assert.equal(f.by('activate').disabled,false);
 }finally{f.close()}
});
test('server rejection appears next to activation without being delayed by another status request',async()=>{
 const f=await fixture({activation:'reject'});try{await f.begin();f.by('saved').checked=true;f.by('activation-code').value='012345';const before=f.requests.length;f.submit('activate');assert.equal(f.by('activate').textContent,'Wird geprüft …');assert.equal(f.by('activation-feedback').textContent,'Wird geprüft …');await tick();assert.match(f.by('activation-feedback').textContent,/ungültig/);assert.equal(f.lastScroll,'activation-feedback');assert.deepEqual(f.requests.slice(before).map(r=>r.action),['activate']);assert.equal(f.by('activate').disabled,false);assert.equal(f.by('enrollment').hidden,false)}finally{f.close()}
});
test('grouped pasted code preserves all six digits and lost success replies resolve from server status',async()=>{
 for(const activation of ['success','lost']){const f=await fixture({activation});try{await f.begin();assert(Number(f.by('activation-code').maxLength)>=7);f.by('saved').checked=true;f.by('activation-code').value='012\u202f345';f.submit('activate');await tick();assert.equal(f.requests.find(r=>r.action==='activate').body.code,'012345');assert.match(f.by('state').textContent,/Aktiv –/);assert.equal(f.by('activation-code').value,'');assert.equal(f.by('manual-key').value,'');assert.equal(f.by('loginForm').elements.password.value,'')}finally{f.close()}}
});
test('browser back/forward restoration rechecks status and never leaves a silently closed form',async()=>{
 const f=await fixture();try{await f.begin();f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(f.by('manual-key').value,'');f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();assert.equal(f.by('begin').hidden,false);assert.match(f.by('form-feedback').textContent,/unterbrochen/);assert.equal(f.by('begin').disabled,false);await f.begin();assert.equal(f.requests.filter(r=>r.action==='begin').length,2)}finally{f.close()}
});
test('restored page cannot adopt another account and timeout produces visible retry feedback',async()=>{
 const switched=await fixture();try{await switched.begin();switched.w.dispatchEvent(new switched.w.PageTransitionEvent('pagehide',{persisted:true}));switched.w.localStorage.setItem('bringness-market-admin-token','b'.repeat(64));const count=switched.requests.length;switched.w.dispatchEvent(new switched.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();assert.equal(switched.by('settings').hidden,true);assert.match(switched.by('message').textContent,/Konto gewechselt/);assert.equal(switched.requests.length,count)}finally{switched.close()}
 const f=await fixture({activation:'timeout',shortTimeout:true});try{await f.begin();f.by('saved').checked=true;f.by('activation-code').value='123456';f.submit('activate');await new Promise(r=>setTimeout(r,80));assert.match(f.by('activation-feedback').textContent,/Verbindung/);assert.equal(f.by('activate').disabled,false)}finally{f.close()}
});

import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {adminHtml,adminApi} from './admin-navigation-fixture.mjs';
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(check){const end=Date.now()+4000;while(!check()){if(Date.now()>end)throw Error('Admin UI condition timed out');await pause();}}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const overview='/api/v1/platform/control/overview';
async function fixture(intercept=()=>null){
 const d=new JSDOM(adminHtml(),{url:'https://admin-fixture.test/admin/',runScripts:'outside-only'}),w=d.window,requests=[],downloads=[],errors=[];
 w.localStorage.setItem('bringness-pos-token','synthetic-admin');
 w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:synthetic';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.addEventListener('error',e=>errors.push(e.message));
 const response=(data,status=200)=>({ok:status<400,status,json:async()=>data,blob:async()=>new w.Blob(['synthetic audit'])});
 w.fetch=async(path,options={})=>{
  requests.push({path,method:options.method||'GET'});const intercepted=intercept(path,options,{w,response});if(intercepted)return intercepted;
  if(path.startsWith('/api/v1/admin/audit/export'))return response({});const r=adminApi(path);return response(structuredClone(r.data),r.status);
 };
 for(const script of w.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 return {w,$:id=>w.document.getElementById(id),requests,downloads,errors,response,close:()=>w.close()};
}
const normal=await fixture();try{
 await until(()=>normal.$('platformSummary').style.display==='block');assert.equal(normal.$('platformCompanyCount').textContent,'1');assert.equal(normal.$('platformPrices').querySelector('b').textContent,'Testmodul');
 assert.equal(normal.requests.filter(r=>r.path==='/api/v1/platform/overview').length,0);
 normal.$('auditExport').click();await until(()=>normal.downloads.length===1);assert.deepEqual(normal.errors,[]);
}finally{normal.close();}
for(const mode of ['failure','malformed','forbidden']){
 const f=await fixture((path,o,{response})=>path===overview?response(mode==='malformed'?{companies:1}:{error:'Synthetic failure'},mode==='forbidden'?403:mode==='failure'?500:200):null);
 try{await until(()=>mode==='forbidden'?f.$('noPlatform').style.display==='block':f.$('platformOverviewMessage').textContent.startsWith('Übersicht konnte'));
  assert.equal(f.$('platformSummary').style.display,'none');if(mode!=='forbidden')assert.equal(f.$('noPlatform').style.display,'none','a backend error must not suggest first-time platform setup');
  assert(f.requests.every(r=>r.method==='GET'));assert.deepEqual(f.errors,[]);
 }finally{f.close();}
}
const first=deferred();let calls=0;
const ordered=await fixture((path,o,{response})=>path===overview&&++calls===1?first.promise:null);
try{
 await until(()=>calls===1);await ordered.w.loadPlatform();assert.equal(ordered.$('platformCompanyCount').textContent,'1');
 const stale=structuredClone(adminApi(overview).data);stale.summary.companies=999;first.resolve(ordered.response(stale));await pause();await pause();assert.equal(ordered.$('platformCompanyCount').textContent,'1','older overview must not replace newer response');
}finally{ordered.close();}
const pendingOverview=deferred();
const switched=await fixture(path=>path===overview?pendingOverview.promise:null);
try{
 await until(()=>switched.requests.some(r=>r.path===overview));switched.w.localStorage.setItem('bringness-pos-token','other-session');switched.w.dispatchEvent(new switched.w.StorageEvent('storage',{key:'bringness-pos-token',newValue:'other-session'}));
 pendingOverview.resolve(switched.response(adminApi(overview).data));await pause();await pause();assert.equal(switched.$('dash').style.display,'none');assert.equal(switched.$('platformSummary').style.display,'none');assert.equal(switched.$('platformPrices').childElementCount,0);assert.equal(switched.w._companies.length,0);
}finally{switched.close();}
const pendingShow=deferred();const signInSwitch=await fixture(path=>path==='/api/v1/admin/overview'?pendingShow.promise:null);
try{await until(()=>signInSwitch.requests.some(r=>r.path==='/api/v1/admin/overview'));signInSwitch.w.localStorage.removeItem('bringness-pos-token');signInSwitch.w.dispatchEvent(new signInSwitch.w.StorageEvent('storage',{key:'bringness-pos-token',newValue:null}));pendingShow.resolve(signInSwitch.response({restaurants:99}));await pause();await pause();assert.equal(signInSwitch.$('dash').style.display,'none');assert.equal(signInSwitch.requests.some(r=>r.path===overview),false);}finally{signInSwitch.close();}
for(const mode of ['filter','session','blob-session','pagehide']){
 const pending=deferred();let started=false;
 const f=await fixture((path,o,{response})=>{
  if(!path.startsWith('/api/v1/admin/audit/export'))return null;started=true;
  return mode==='blob-session'?{...response({}),blob:()=>pending.promise}:pending.promise;
 });
 try{
  await until(()=>f.$('platformSummary').style.display==='block');f.$('auditExport').click();await until(()=>started);f.$('auditExport').onclick();assert.equal(f.requests.filter(r=>r.path.startsWith('/api/v1/admin/audit/export')).length,1,'double click cannot start another export');
  if(mode==='filter')f.$('auditFrom').value='2026-01-01';
  else if(mode==='pagehide')f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
  else{f.w.localStorage.setItem('bringness-pos-token','other-session');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token',newValue:'other-session'}));}
  pending.resolve(mode==='blob-session'?new f.w.Blob(['late private audit']):f.response({}));await pause();await pause();assert.equal(f.downloads.length,0,mode+' must discard late export bytes');assert.equal(f.$('auditExport').disabled,false);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
}
console.log('POS admin UI passed: real overview contract, visible modules, error/permission separation, newest response wins, sign-in/storage/page lifecycle isolation and double-click/stale audit download protection.');

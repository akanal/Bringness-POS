import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../../apps/web/public/admin/platform-hub.js',import.meta.url),'utf8'),tick=()=>new Promise(resolve=>setImmediate(resolve));
const fixture=()=>{
 const w=new JSDOM('<div class="tabs"></div><main id="dash"></main>',{url:'https://admin.test/admin/',runScripts:'outside-only',pretendToBeVisual:true}).window;
 w.AbortSignal.timeout=()=>new w.AbortController().signal;w.localStorage.setItem('bringness-pos-token','admin-session');const timers=[],calls=[];w.setInterval=fn=>{timers.push(fn);};
 let state='open',revision=1,conflict=false,delayed=null;
 w.fetch=async(path,options)=>{
  calls.push({path,options});
  if(options.headers.authorization!=='Bearer admin-session')return {ok:false,status:403,json:async()=>({error:'Forbidden'})};
  if(path.endsWith('/companies'))return {ok:true,json:async()=>({companies:[]})};
  if(path.endsWith('/summary'))return {ok:true,json:async()=>({openCount:state==='resolved'?0:1})};
  if(path.endsWith('/status')){if(conflict)return {ok:false,status:409,json:async()=>({error:'Meldung inzwischen aktualisiert. Bitte neu laden und prüfen.'})};const body=JSON.parse(options.body);assert.equal(body.revision,revision);state=body.state;revision++;return {ok:true,json:async()=>({report:{state,revision}})};}
  if(path.includes('/diagnostics?')){if(delayed)await delayed;return {ok:true,json:async()=>({openCount:state==='resolved'?0:1,reports:[{id:'11111111-1111-4111-8111-111111111111',company_name:'<img src=x onerror=alert(1)>',restaurant_name:'Fixture',code:'POS-STOCK-NETWORK',component_version:'pos-diagnostics-admin-20261116',occurrences:2,last_seen_at:'2026-11-16T12:00:00Z',state,revision}]})};}
  return {ok:true,json:async()=>({restaurants:[],counts:[],sales:[]})};
 };
 w.eval(source);return {w,timers,calls,set conflict(v){conflict=v;},set delayed(v){delayed=v;},close:()=>w.close()};
};
test('admin sees bundled reports, safe text, revision-based acknowledgement and resolution',async()=>{
 const f=fixture();try{await tick();assert.match(f.w.document.getElementById('platformHubTab').textContent,/1 Fehler/);f.w.document.getElementById('platformHubTab').click();await tick();
 let host=f.w.document.getElementById('hubDiagnostics');assert.match(host.textContent,/POS-STOCK-NETWORK/);assert.match(host.textContent,/<img src=x/);assert.equal(host.querySelector('img'),null);
 [...host.querySelectorAll('button')].find(b=>b.textContent==='In Bearbeitung nehmen').click();await tick();assert.match(host.textContent,/In Bearbeitung · 2 Meldung/);
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Als behoben markieren').click();await tick();assert.match(host.textContent,/Als behoben markiert/);assert.equal(f.w.document.getElementById('platformHubTab').textContent,'POS');
 const posts=f.calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,2);assert.deepEqual(posts.map(c=>JSON.parse(c.options.body)),[{state:'acknowledged',revision:1},{state:'resolved',revision:2}]);
 }finally{f.close();}
});
test('conflicting status is visible and never retried automatically',async()=>{
 const f=fixture();try{await tick();f.w.document.getElementById('platformHubTab').click();await tick();f.conflict=true;const host=f.w.document.getElementById('hubDiagnostics');[...host.querySelectorAll('button')].find(b=>b.textContent==='Als behoben markieren').click();await tick();
 assert.match(host.querySelector('[role=status]').textContent,/inzwischen aktualisiert/);assert.equal(host.querySelector('button').disabled,false);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
 }finally{f.close();}
});
test('account changes remove admin data and discard late report responses',async()=>{
 const f=fixture();try{await tick();let release;f.delayed=new Promise(resolve=>{release=resolve;});f.w.document.getElementById('platformHubTab').click();await tick();f.w.localStorage.setItem('bringness-pos-token','tenant-session');await f.timers[0]();await tick();release();await tick();
 assert.equal(f.w.document.getElementById('platformHubTab'),null);assert.equal(f.w.document.getElementById('platformHub'),null);assert(!f.w.document.body.textContent.includes('POS-STOCK-NETWORK'));
 }finally{f.close();}
});

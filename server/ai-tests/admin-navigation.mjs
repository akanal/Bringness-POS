import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {adminHtml,adminRoot,adminExtensions,adminApi} from './admin-navigation-fixture.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw Error('Admin navigation condition not reached');await sleep(5);}}
async function fixture(platform=true,hash=''){
 const dom=new JSDOM(adminHtml(),{runScripts:'outside-only',url:'https://admin-navigation.test/admin/'+hash});const w=dom.window,requests=[],timers=[],errors=[];
 w.localStorage.setItem('bringness-pos-token','synthetic-admin');w.AbortSignal.timeout=()=>undefined;w.setInterval=fn=>{timers.push(fn);return timers.length;};w.addEventListener('error',event=>errors.push(event.error));
 w.fetch=async(path,options={})=>{requests.push({path,method:options.method||'GET'});const r=adminApi(path,{platform});return {ok:r.status<400,status:r.status,json:async()=>structuredClone(r.data)};};
 const inline=[...w.document.querySelectorAll('script:not([src])')];for(const script of inline)w.eval(script.textContent);
 for(const path of ['admin/online-register-link.js','admin/navigation.js',...adminExtensions])w.eval(readFileSync(new URL(path,adminRoot),'utf8'));
 await until(()=>w.BringnessAdminNavigation);await sleep(20);for(const timer of timers)await timer();await sleep(30);
 return {dom,w,requests,errors,$:selector=>w.document.querySelector(selector),close:()=>w.close()};
}
const f=await fixture();
try{
 const {$,w}=f;
 await until(()=>$('[data-admin-item=overview]')&&$('[data-tab=allRegisters]'));
 assert.deepEqual([...w.document.querySelectorAll('[data-admin-group]')].map(b=>b.dataset.adminGroup),['overview','registers','customers','team','support','system']);
 assert.equal($('.tabs').hidden,true);assert.equal($('#adminMore'),null);
 assert.equal(w.document.querySelectorAll('#dash > .kpis').length,0);
 const ids=[...w.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
 $('[data-admin-group=registers]').click();await until(()=>$('#registerList [data-register]'));
 assert.equal($('#allRegisters').classList.contains('active'),true);assert.equal($('#adminNavigation').dataset.group,'registers');
 assert.equal(w.document.querySelectorAll('#registerList a[href^="/pos/place-terminology.html"]').length,1);
 assert.equal($('[data-admin-item=devices]'),null);assert.equal($('[data-admin-item=business]'),null);
 $('[data-tab=devicesPanel]').click();await sleep(5);assert.equal($('#allRegisters').classList.contains('active'),true);
 $('[data-admin-group=customers]').click();await until(()=>$('#detailSearch'));
 $('[data-admin-item=licences]').click();$('#price-fixture').value='42.00';const before=f.requests.length;
 $('[data-admin-group=customers]').click();assert.equal($('#price-fixture').value,'42.00');assert.equal(f.requests.length,before,'active group must not reload a form');
 $('[data-admin-group=support]').click();await until(()=>$('#supportList'));
 assert.equal($('[data-admin-item=mail]').getAttribute('href'),'/admin/mail.html');assert.equal(w.document.querySelectorAll('#adminNavigation a[href="/admin/mail.html"]').length,1);
 $('[data-admin-item=remote]').click();await until(()=>$('#remoteDevices'));
 $('[data-admin-group=system]').click();await until(()=>$('#hubDiagnostics select'));assert.equal($('.admin-nav-badge').textContent,'2');assert.equal($('#hubTerms'),null);
 assert.equal($('#adminNavigation').dataset.group,'system');assert.equal(w.document.querySelectorAll('#dash > .panel.active').length,1);
 // Existing deep actions still activate the correct grouped navigation.
 $('[data-tab=customerDetail]').click();await sleep(5);assert.equal($('#adminNavigation').dataset.group,'customers');assert.equal($('[data-admin-item=customers]').getAttribute('aria-current'),'page');
 // Late extensions remain reachable, and removing an active capability falls back safely.
 const button=w.document.createElement('button');button.dataset.tab='futureTool';button.textContent='Weiteres Werkzeug';const panel=w.document.createElement('section');panel.id='futureTool';panel.className='panel';$('#dash').append(panel);button.onclick=()=>{for(const p of w.document.querySelectorAll('.panel'))p.classList.toggle('active',p===panel);};$('.tabs').append(button);await sleep(5);
 $('[data-admin-group=system]').click();$('[data-admin-item=extension-futureTool]').click();assert.equal(panel.classList.contains('active'),true);button.remove();panel.remove();await sleep(5);assert.equal(w.document.querySelectorAll('#dash > .panel.active').length,1);
 for(const id of ['allRegisters','platformHub','customerDetail','accountCenter','globalAudit']){w.document.querySelector('[data-tab="'+id+'"]')?.remove();w.document.getElementById(id)?.remove();}await sleep(5);
 $('[data-admin-group=support]').click();assert.equal($('[data-admin-item=mail]'),null);$('[data-admin-group=registers]').click();assert($('[data-admin-item=devices]'));assert.equal($('[data-admin-item=modules]'),null);
 assert(f.requests.every(r=>r.method==='GET'),'navigation must not write business or account data');assert.deepEqual(f.errors,[]);
}finally{f.close();}
const tenant=await fixture(false);try{tenant.$('[data-admin-group=registers]').click();assert(tenant.$('[data-admin-item=devices]'));assert.equal(tenant.$('[data-admin-item=modules]'),null);tenant.$('[data-admin-group=support]').click();assert.equal(tenant.$('[data-admin-item=mail]'),null);assert.deepEqual(tenant.errors,[]);}finally{tenant.close();}
const deep=await fixture(true,'#system/diagnostics');try{await until(()=>deep.$('#hubDiagnostics select'));assert.equal(deep.$('#adminNavigation').dataset.group,'system');assert.equal(deep.$('[data-admin-item=diagnostics]').getAttribute('aria-current'),'page');assert.deepEqual(deep.errors,[]);}finally{deep.close();}
console.log('Admin navigation passed: six semantic groups, canonical links, legacy action aliases, late capabilities/deep links, active-form retention, role-aware destinations, no duplicate IDs and read-only navigation.');

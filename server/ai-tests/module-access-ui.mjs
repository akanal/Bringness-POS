import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../../apps/web/public/pos/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../../apps/web/public/pos/index.html',import.meta.url),'utf8');
assert(!/<a[^>]+href="\/pos\/\?view=lizenz"/.test(html),'duplicate account-menu link stays removed');
const w=new JSDOM('<div id="moduleBody"></div>',{url:'https://fixture.test/pos/',runScripts:'outside-only'}).window;
const calls=[],alerts=[],opened=[];let latestActive=false;
w.$=id=>w.document.getElementById(id);w.money=n=>String(n);w.esc=s=>s||'';w.applyBusinessMode=()=>{};w.alert=m=>alerts.push(m);w.ensurePersonnelAccess=async()=>true;w.showModule=async view=>opened.push(view);
function status(){return {features:{pos_base:true,display_control:true,kitchen:true},featureRows:[{feature_code:'kitchen',status:'active',payment_status:'canceled',ends_at:'2099-01-01'}],plans:[{code:'display_control_monthly',active:true,included:true,eligible:false,amount:14.99},{code:'kitchen_monthly',active:true,eligible:false,amount:9.99},{code:'personnel_monthly',active:latestActive,eligible:!latestActive,amount:9.99},{code:'table_qr_monthly',active:false,eligible:false,amount:29.99,requires:['pos_base','table_management']}]};}
w.api=async(path,options)=>{calls.push({path,options});if(path==='/billing/status')return status();if(path==='/billing/owner-email')return {email:'owner@example.test',verified:true};if(path==='/licensing')return {plans:[]};if(path==='/billing/invoices')return {invoices:[]};if(path==='/billing/profile')return {profile:{}};return {};};
w.eval(source.split('\n').find(l=>l.startsWith('async function renderLicensing')));await w.renderLicensing();
let card=w.document.querySelector('[data-license-plan="display_control_monthly"]');assert.equal(card.closest('section').dataset.licenseGroup,'owned');assert.match(card.textContent,/Bereits enthalten/);assert(!card.querySelector('[data-buy-plan]'));assert.equal(w.document.querySelectorAll('[data-license-plan="display_control_monthly"]').length,1);await card.querySelector('#openOwnedDisplay').onclick();assert.deepEqual(opened,['displays']);
card=w.document.querySelector('[data-license-plan="kitchen_monthly"]');assert.match(card.textContent,/Bereits gebucht/);assert.match(card.textContent,/Gekündigt bis/);assert(!card.querySelector('[data-buy-plan]'));
card=w.document.querySelector('[data-license-plan="table_qr_monthly"]');assert(card.querySelector('button').disabled);assert.match(card.textContent,/Tischsystem/);
card=w.document.querySelector('[data-license-plan="personnel_monthly"]');assert.equal(card.closest('section').dataset.licenseGroup,'basic');assert.match(card.querySelector('button').textContent,/Jetzt buchen/);
// Another tab activates the module after the overview was loaded. No new mail/payment.
latestActive=true;await card.querySelector('button').onclick();assert(!calls.some(c=>c.path==='/billing/module-request'));assert(!calls.some(c=>c.path==='/billing/checkout'));assert.match(alerts.at(-1),/bereits verfügbar/);assert(!w.document.querySelector('[data-license-plan="personnel_monthly"] [data-buy-plan]'));
latestActive=false;await w.renderLicensing();await w.document.querySelector('[data-buy-plan="personnel_monthly"]').onclick();assert.equal(calls.filter(c=>c.path==='/billing/module-request').length,1);assert(!calls.some(c=>c.path==='/billing/checkout'));w.close();
// Exercise actual settings navigation and its display dispatch, not just an isolated editor.
const v=new JSDOM('<select id="restaurant"><option value="r">Testbetrieb</option></select><nav id="mainnav"></nav><div id="kasseView"></div><div id="moduleView"></div>',{url:'https://fixture.test/pos/',runScripts:'outside-only'}).window;
v.$=id=>v.document.getElementById(id);v.isRestaurantMode=()=>false;v.posPackageFeatures={display_control:true};let unlocked=true,rendered=0,licensing=0;
v.ensurePersonnelAccess=async()=>unlocked;v.renderDisplaySettings=async()=>{rendered++;v.document.getElementById('moduleBody').innerHTML='<h3>Bildschirme</h3><button>Neu</button>';};v.renderRestaurantBranding=async()=>{};v.renderLicensing=async()=>{licensing++};
v.eval(source.slice(source.indexOf('const moduleInfo='),source.indexOf('async function downloadReceipt')));
await v.showModule('einstellungen');assert.equal(v.document.getElementById('openDisplaySettings').textContent,'Displaysteuerung öffnen');await v.document.getElementById('openDisplaySettings').onclick();assert.equal(rendered,1);assert.match(v.document.getElementById('moduleBody').textContent,/Bildschirme/);
unlocked=false;await v.showModule('displays');assert.equal(rendered,1,'administrative unlock cannot be bypassed');unlocked=true;v.posPackageFeatures.display_control=false;await v.showModule('displays');assert.equal(rendered,1);assert.equal(licensing,1);await v.showModule('einstellungen');assert.equal(v.document.getElementById('openDisplaySettings').textContent,'Displaymodul ansehen');await v.document.getElementById('openDisplaySettings').onclick();assert.equal(licensing,2);v.close();
console.log('Module access UI passed: included/owned/unowned states, canceled paid period, explicit eligible booking, prerequisites, stale-tab duplicate prevention, settings display entry, actual editor dispatch and administrative/module guards. No external payment or mail.');

// Use the real PIN gate, navigation hook, fetch wrapper and display editor together.
const a=new JSDOM('<select id="restaurant"><option value="r">Testbetrieb</option></select><button id="personnelBtn"></button><nav id="mainnav"><div id="moreMenu"></div></nav><div id="kasseView"></div><div id="moduleView"></div>',{url:'https://fixture.test/pos/',runScripts:'outside-only'}).window;
a.Headers=Headers;a.URL.revokeObjectURL=()=>{};a.URL.createObjectURL=()=> 'blob:fixture';a.$=id=>a.document.getElementById(id);a.isRestaurantMode=()=>false;a.posPackageFeatures={display_control:true};a.renderRestaurantBranding=async()=>{};a.localStorage.setItem('bringness-pos-token','fixture-session');let now=1000000,tick,unlocks=0,locks=0,accessChecks=0;const displayHeaders=[];
a.Date.now=()=>now;a.setInterval=fn=>{tick=fn;return 1};a.alert=message=>{throw Error(message)};
a.fetch=async(input,init={})=>{
 const path=new URL(input,a.location.href).pathname,headers=new Headers(init.headers);let body={},status=200;
 if(path==='/api/v1/personnel/access'){accessChecks++;body={canManage:true,configured:true};}
 else if(path==='/api/v1/personnel/unlock'){unlocks++;body={unlockToken:'fixture-unlock'};}
 else if(path==='/api/v1/personnel/lock'){locks++;}
 else if(path.startsWith('/api/v1/displays')){displayHeaders.push(headers.get('x-personnel-unlock'));if(headers.get('x-personnel-unlock')!=='fixture-unlock'){status=403;body={error:'Verwaltungs-PIN erforderlich'};}else body=path.endsWith('/media')?{media:[]}:{displays:[]};}
 else if(path==='/api/v1/bootstrap')body={restaurants:[{id:'r',name:'Testbetrieb'}],categories:[],products:[]};
 return {ok:status<400,status,json:async()=>body};
};
a.eval(source.slice(source.indexOf('const moduleInfo='),source.indexOf('async function downloadReceipt')));
a.eval(await readFile(new URL('../../apps/web/public/pos/personnel.js',import.meta.url),'utf8'));
a.eval(await readFile(new URL('../../apps/web/public/pos/displays.js',import.meta.url),'utf8'));
async function authorize(){const opening=a.showModule('einstellungen');await new Promise(r=>setTimeout(r,0));const form=a.document.querySelector('.personnel-dialog form');assert(form);form.querySelector('[name="pin"]').value='123456';await form.onsubmit({preventDefault(){},currentTarget:form});await opening;}
await authorize();assert.equal(unlocks,1);assert.equal(accessChecks,1);
await a.showModule('displays');assert(a.document.getElementById('displayForm'),a.document.getElementById('moduleBody').textContent);assert.equal(locks,0);assert.deepEqual(displayHeaders,['fixture-unlock','fixture-unlock']);
await a.showModule('einstellungen');await a.showModule('displays');assert.equal(unlocks,1);assert.equal(accessChecks,1);assert.equal(locks,0);
// Timeout still expires the administrative workspace and clears editor previews.
now+=180001;tick();await new Promise(r=>setTimeout(r,0));assert.equal(locks,1);assert.equal(a.document.getElementById('displayForm'),null);assert.match(a.document.getElementById('moduleBody').textContent,/abgelaufen/);
await authorize();assert.equal(unlocks,2);await a.showModule('displays');await a.showModule('kasse');await new Promise(r=>setTimeout(r,0));assert.equal(locks,2,'leaving settings and subpages still locks');
const reopening=a.showModule('einstellungen');await new Promise(r=>setTimeout(r,0));assert(a.document.querySelector('.personnel-dialog'));a.document.querySelector('[data-close]').click();await reopening;assert.equal(unlocks,2);a.close();
console.log('Administrative navigation passed: one PIN unlock survives settings/display/back transitions with real request headers; timeout and workspace exit revoke access and require a new explicit unlock.');

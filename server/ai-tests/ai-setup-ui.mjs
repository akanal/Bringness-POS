import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const publicFile = (path) => readFile(new URL('../../apps/web/public/' + path, import.meta.url));
const html = await publicFile('ai-workspace.html');
const script = await publicFile('ai-workspace.js');
const landing = new JSDOM(await publicFile('ai.html'));
assert.ok(landing.window.document.querySelector('#betrieb-einrichten a[href="/ai-workspace.html?setup=1"]'));
assert.equal((await publicFile('assets/Bringness-Restaurant-Einrichtungsbogen.pdf')).subarray(0, 4).toString(), '%PDF');
landing.window.close();

const pages = {
 '/api/ai/me': {account:{id:'ai-account',role:'restaurant'},launch:{}},
 '/api/ai/locations': {locations:[]},
 '/api/ai/stock': {stock:[]},
 '/api/ai/stock-moves': {moves:[]},
 '/api/ai/connectors': {connectors:[]},
 '/api/ai/recipe-events': {events:[]},
 '/api/ai/monitor': {}
};

for (const mode of ['manual', 'pos']) {
 const {window:w} = new JSDOM(html, {url:'https://example.org/ai-workspace.html?setup=1',runScripts:'outside-only'});
 const {document} = w;
 const calls = [];
 let denyLogin = true;
 w.sessionStorage.setItem('bringness-ai-session','ai-token');
 w.fetch = async (path, options) => {
  const body = options.body && JSON.parse(options.body);
  calls.push({path,body});
  if (path === '/api/v1/auth/login') {
   const deny = denyLogin;
   denyLogin = false;
   return {ok:!deny,status:deny?401:200,json:async()=>deny?{error:'POS-Anmeldung prüfen'}:{token:'pos-token'}};
  }
  const result = path === '/api/ai/pos-link' ? (body.setupLocation ? {ok:true} : {restaurants:[{id:'pos-location',name:'Bistro'}]}) : pages[path];
  assert.ok(result, path);
  return {ok:true,json:async()=>result};
 };
 const until = async (condition) => {
  for (let i=0; i<100; i++) {
   const result = condition();
   if (result) return result;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(document.getElementById('notice').textContent || 'Navigation timed out');
 };
 const form = (kind) => document.querySelector(`[data-form="${kind}"]`);
 const submit = (f, values) => {
  for (const [key,value] of Object.entries(values)) f.elements[key].value=value;
  f.requestSubmit();
 };
 try {
  w.eval(script.toString());
  const manual = await until(()=>form('setup-manual'));
  if (mode === 'manual') {
   submit(manual,{name:'Bistro',address:'Marktstraße 1, Berlin'});
   await until(()=>form('location'));
   assert.deepEqual(calls.find(c=>c.path==='/api/ai/locations'&&c.body).body,{name:'Bistro',address:'Marktstraße 1, Berlin'});
  } else {
   const login = form('setup-pos-login');
   const credentials = {posEmail:'pos@example.org',posPassword:'example-password'};
   submit(login,credentials);
   await until(()=>document.getElementById('notice').textContent==='POS-Anmeldung prüfen');
   assert.equal(w.sessionStorage.getItem('bringness-ai-session'),'ai-token');
   submit(login,credentials);
   const save = await until(()=>form('setup-pos-save'));
   assert.equal(save.elements.restaurantId.selectedOptions[0].textContent,'Bistro');
   assert.equal(login.elements.posPassword.value,'');
   submit(save,{address:'Marktstraße 1, Berlin'});
   await until(()=>form('connector'));
   assert.deepEqual(calls.find(c=>c.body?.setupLocation).body,{restaurantId:'pos-location',address:'Marktstraße 1, Berlin',posToken:'pos-token',setupLocation:true});
  }
 } finally {w.close()}
}

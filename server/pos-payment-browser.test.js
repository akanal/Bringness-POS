import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const playwright=await import(process.env.CENTER_TEST_PLAYWRIGHT||'playwright');
const engine=playwright[process.env.CENTER_TEST_BROWSER||'chromium'];
const restaurant='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
const scripts={cash:await readFile(new URL('../apps/web/public/pos/payment-flow.js',import.meta.url),'utf8'),table:await readFile(new URL('../apps/web/public/pos/settlement-flow.js',import.meta.url),'utf8')};
const api=`async function api(path,options){const response=await fetch('/api/v1'+path,{...options,headers:{'content-type':'application/json'}});const body=await response.json();if(!response.ok){const error=Error(body.error);error.status=response.status;error.code=body.code;throw error;}return body;}`;
function html({empty=false,table=false}={}){
 return '<!doctype html><meta charset="utf-8"><select id="restaurant"><option value="'+restaurant+'">Fixture</option></select><div class="basket"><select id="paymentMethod"><option value="cash">Cash</option><option value="card">Card</option></select><button id="pay">Pay</button><p id="saleMsg"></p></div><button id="settle">Settle</button><p id="tableMsg"></p><script>var cart='+JSON.stringify(empty?[]:[{id:product,qty:1,price:2.5}])+';function renderCart(){};'+api+'</script><script src="/cash.js"></script><script src="/table.js"></script><script>document.getElementById("settle").onclick=async()=>{try{const result=await bnSettleTable({tableId:'+JSON.stringify(restaurant)+',paymentMethod:document.getElementById("paymentMethod").value,orderIds:'+JSON.stringify(empty?[]:[product])+',expectedTotalCents:'+(empty?0:250)+'});document.getElementById("tableMsg").textContent=result.receiptNumbers.join(",");}catch(error){document.getElementById("tableMsg").textContent=error.message;}};</script>';
}
async function fixture(onApi){
 const browser=await engine.launch({headless:true}),page=await browser.newPage();let visits=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://payment.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/pos/')return route.fulfill({contentType:'text/html',body:html({empty:visits++>0})});
  if(path==='/cash.js')return route.fulfill({contentType:'text/javascript',body:scripts.cash});
  if(path==='/table.js')return route.fulfill({contentType:'text/javascript',body:scripts.table});
  if(path.startsWith('/api/'))return onApi(route);
  return route.abort();
 });
 await page.goto('https://payment.test/pos/');return {browser,page,errors};
}
const cashResult=body=>({requestKey:body.requestKey,id:'33333333-3333-4333-8333-333333333333',restaurantId:restaurant,status:'paid',receiptNumber:'BN-1',totalCents:250});
test('cash checkout retries the same persisted operation after browser reload and a lost reply',async()=>{
 const requests=[],committed=new Set();const f=await fixture(async route=>{
  const b=route.request().postDataJSON();requests.push(b);if(!committed.has(b.requestKey)){committed.add(b.requestKey);return route.abort('failed');}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({...cashResult(b),replayed:true})});
 });
 try{
  await f.page.click('#pay');await f.page.waitForFunction(()=>document.querySelector('#saleMsg').textContent.includes('ungeklärt'));
  await f.page.reload();assert.equal(await f.page.evaluate(()=>cart.length),0);
  await f.page.click('#pay');await f.page.waitForFunction(()=>document.querySelector('#saleMsg').textContent.includes('Verkauf gespeichert'));
  assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(committed.size,1);assert.equal(await f.page.evaluate(id=>localStorage.getItem('bringness.checkout.pending.v1:'+id),restaurant),null);assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});
test('table replay after reload keeps the original order snapshot even when the table is now empty',async()=>{
 const requests=[],committed=new Set();const f=await fixture(async route=>{
  const b=route.request().postDataJSON();requests.push(b);if(!committed.has(b.requestKey)){committed.add(b.requestKey);return route.abort('failed');}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({requestKey:b.requestKey,tableId:b.tableId,method:'cash',paidOrders:1,totalCents:250,receiptIds:[product],receiptNumbers:['BN-TABLE'],replayed:true})});
 });
 try{
  await f.page.click('#settle');await f.page.waitForFunction(()=>document.querySelector('#tableMsg').textContent.includes('nicht erneut kassieren'));
  await f.page.reload();await f.page.click('#settle');await f.page.waitForFunction(()=>document.querySelector('#tableMsg').textContent==='BN-TABLE');
  assert.deepEqual(requests[0],requests[1]);assert.equal(committed.size,1);assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});
test('browser storage failure blocks a cash checkout before any request is sent',async()=>{
 let calls=0;const f=await fixture(async route=>{calls++;return route.abort();});
 try{
  await f.page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('quota');};});await f.page.click('#pay');
  await f.page.waitForFunction(()=>document.querySelector('#saleMsg').textContent.includes('Keine neue Zahlung'));assert.equal(calls,0);assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});
test('cash and table screens refuse unverified card confirmation without contacting a provider',async()=>{
 let calls=0;const f=await fixture(async route=>{calls++;return route.abort();});
 try{
  await f.page.selectOption('#paymentMethod','card');await f.page.click('#pay');await f.page.waitForFunction(()=>document.querySelector('#saleMsg').textContent.includes('serverseitig'));
  await f.page.click('#settle');await f.page.waitForFunction(()=>document.querySelector('#tableMsg').textContent.includes('serverseitig'));assert.equal(calls,0);assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});

test('module overview exposes booking states and opens the real display editor from settings',async()=>{
 const app=await readFile(new URL('../apps/web/public/pos/app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../apps/web/public/pos/licensing.css',import.meta.url),'utf8');
 const index=await readFile(new URL('../apps/web/public/pos/index.html',import.meta.url),'utf8');
 const display=await readFile(new URL('../apps/web/public/pos/displays.js',import.meta.url),'utf8');
 const navigation=app.slice(app.indexOf('const moduleInfo='),app.indexOf('async function downloadReceipt'));
 const licensing=app.split('\n').find(line=>line.startsWith('async function renderLicensing'));
 const bootstrap={restaurants:[{id:restaurant,name:'Testbetrieb'}],categories:[],products:[]};
 const state={features:{pos_base:true,display_control:true},featureRows:[],plans:[{code:'display_control_monthly',active:true,included:true,eligible:false,amount:14.99},{code:'personnel_monthly',active:false,eligible:true,amount:9.99},{code:'table_qr_monthly',active:false,eligible:false,requires:['pos_base','table_management'],amount:29.99}]};
 const fixtureScript=`const $=id=>document.getElementById(id);function isRestaurantMode(){return false}function applyBusinessMode(){}function money(n){return n.toFixed(2)+' EUR'}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}window.ensurePersonnelAccess=async()=>true;window.posPackageFeatures=${JSON.stringify(state.features)};async function renderRestaurantBranding(){}async function api(path){if(path==='/billing/status')return ${JSON.stringify(state)};if(path==='/licensing')return {plans:[]};if(path==='/billing/invoices')return {invoices:[]};if(path==='/billing/profile')return {profile:{}};if(path==='/billing/owner-email')return {email:'owner@example.test',verified:true};throw Error('Unexpected fixture request: '+path)};${navigation}\n${licensing}\nshowModule('einstellungen');`;
 for(const width of [390,1280]){
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://modules.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/pos/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+(index.match(/<style>[\s\S]*?<\/style>/)?.[0]||'')+'<style>'+css+'</style><div class="posapp"><select id="restaurant"><option value="'+restaurant+'">Testbetrieb</option></select><nav id="mainnav"><div id="moreMenu"></div></nav><div id="kasseView"></div><div id="moduleView" class="modulepage"></div></div><script src="/displays.js"></script><script src="/fixture.js"></script>'});
   if(path==='/displays.js')return route.fulfill({contentType:'text/javascript',body:display});
   if(path==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixtureScript});
   if(path==='/api/v1/displays')return route.fulfill({json:{displays:[]}});
   if(path==='/api/v1/displays/media')return route.fulfill({json:{media:[]}});
   if(path==='/api/v1/bootstrap')return route.fulfill({json:bootstrap});
   if(path==='/pos/licensing.css')return route.fulfill({contentType:'text/css',body:css});
   return route.abort();
  });
  try{
   await page.goto('https://modules.test/pos/');assert(await page.locator('#openDisplaySettings').isVisible());
   await page.getByRole('button',{name:'Module verwalten',exact:true}).click();
   const owned=page.locator('[data-license-plan="display_control_monthly"]');await owned.waitFor();
   assert.match(await owned.innerText(),/Bereits enthalten/);assert.equal(await owned.locator('[data-buy-plan]').count(),0);
   assert(await page.locator('[data-buy-plan="personnel_monthly"]').isVisible());assert.equal(await page.locator('[data-buy-plan="table_qr_monthly"]').isEnabled(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'module cards must fit viewport');
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}
   await page.locator('#openOwnedDisplay').click();await page.locator('#displayForm').waitFor();assert(await page.getByRole('heading',{name:'Bildschirme',exact:true}).isVisible());assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 }
});

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
 const personnel=await readFile(new URL('../apps/web/public/pos/personnel.js',import.meta.url),'utf8');
 assert.match(index,/<script\b[^>]*src="\/pos\/displays\.js(?:\?[^"]*)?"/, 'actual POS document must load the editor');
 const {moduleCatalog}=await import('./module-catalog.js');
 const baseStyles=(await Promise.all(['styles.css','category-colors.css','pos/sale-tools.css','pos/trade.css','pos/colors.css'].map(path=>readFile(new URL('../apps/web/public/'+path,import.meta.url),'utf8'))));
 const navigation=app.slice(app.indexOf('const moduleInfo='),app.indexOf('async function downloadReceipt'));
 const licensing=app.split('\n').find(line=>line.startsWith('async function renderLicensing'));
 const bootstrap={restaurants:[{id:restaurant,name:'Testbetrieb'}],categories:[],products:[]};
 const state={features:{pos_base:true,display_control:true},featureRows:[],plans:[{code:'pos_base_monthly',active:true,eligible:false,amount:34.99},...Object.entries(moduleCatalog).map(([code,plan])=>({code,active:false,eligible:!plan.requires.includes('table_management'),requires:plan.requires,amount:plan.netCents/100})),{code:'display_control_monthly',active:true,included:true,eligible:false,amount:14.99},{code:'personnel_monthly',active:false,eligible:true,amount:9.99},{code:'table_qr_monthly',active:false,eligible:false,requires:['pos_base','table_management'],amount:29.99}]};
 const fixtureScript=`const $=id=>document.getElementById(id);function isRestaurantMode(){return false}function applyBusinessMode(){}function money(n){return n.toFixed(2)+' EUR'}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}localStorage.setItem('bringness-pos-token','fixture-session');window.posPackageFeatures=${JSON.stringify(state.features)};async function renderRestaurantBranding(){}async function api(path){if(path==='/billing/status')return ${JSON.stringify(state)};if(path==='/licensing')return {plans:[]};if(path==='/billing/invoices')return {invoices:[]};if(path==='/billing/profile')return {profile:{}};if(path==='/license/status')return {};if(path==='/billing/owner-email')return {email:'owner@example.test',verified:true};throw Error('Unexpected fixture request: '+path)};${navigation}\n${licensing}`;
 for(const width of [390,1280]){
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));let unlocks=0,locks=0;
  await page.route('https://modules.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/pos/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+'<style>'+baseStyles[0]+'</style>'+[...index.matchAll(/<style>[\s\S]*?<\/style>/g)].map(match=>match[0]).join('')+'<style>'+baseStyles.slice(1).join('\n')+'\n'+css+'</style><div class="posapp"><select id="restaurant"><option value="'+restaurant+'">Testbetrieb</option></select><nav id="mainnav"><div id="moreMenu"></div></nav><button id="personnelBtn"></button><div id="kasseView"></div><div id="moduleView" class="modulepage"></div></div><script src="/displays.js"></script><script src="/fixture.js"></script><script src="/personnel.js"></script><script>showModule("einstellungen");</script>'});
   if(path==='/displays.js')return route.fulfill({contentType:'text/javascript',body:display});
   if(path==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixtureScript});
   if(path==='/personnel.js')return route.fulfill({contentType:'text/javascript',body:personnel});
   if(path==='/api/v1/personnel/access')return route.fulfill({json:{canManage:true,configured:true}});
   if(path==='/api/v1/personnel/unlock'){unlocks++;return route.fulfill({json:{unlockToken:'fixture-unlock'}});}
   if(path==='/api/v1/personnel/lock'){locks++;return route.fulfill({json:{ok:true}});}
   if(path.startsWith('/api/v1/displays')&&route.request().headers()['x-personnel-unlock']!=='fixture-unlock')return route.fulfill({status:403,json:{error:'Verwaltungs-PIN erforderlich'}});
   if(path==='/api/v1/displays')return route.fulfill({json:{displays:[]}});
   if(path==='/api/v1/displays/media')return route.fulfill({json:{media:[]}});
   if(path==='/api/v1/bootstrap')return route.fulfill({json:bootstrap});
   if(path==='/pos/licensing.css')return route.fulfill({contentType:'text/css',body:css});
   return route.abort();
  });
  try{
   await page.goto('https://modules.test/pos/');await page.locator('.personnel-dialog input[name=pin]').fill('123456');await page.getByRole('button',{name:'Freigeben',exact:true}).click();await page.locator('#openDisplaySettings').waitFor();
   await page.locator('#openDisplaySettings').click();await page.locator('#displayForm').waitFor();assert.equal(unlocks,1);assert.equal(locks,0);await page.locator('#moduleBack').click();await page.locator('#openDisplaySettings').waitFor();
   await page.getByRole('button',{name:'Module verwalten',exact:true}).click();
   const owned=page.locator('[data-license-plan="display_control_monthly"]');await owned.waitFor();
   assert.match(await owned.innerText(),/Bereits enthalten/);assert.equal(await owned.locator('[data-buy-plan]').count(),0);
   assert(await page.locator('[data-buy-plan="personnel_monthly"]').isVisible());assert.equal(await page.locator('[data-buy-plan="table_qr_monthly"]').isEnabled(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'module cards must fit viewport');
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}
   await page.locator('#openOwnedDisplay').click();await page.locator('#displayForm').waitFor();assert(await page.getByRole('heading',{name:'Bildschirme',exact:true}).isVisible());assert.deepEqual(errors,[]);assert.equal(unlocks,1,'one administrative PIN for settings and display subpages');assert.equal(locks,0);
  }finally{await browser.close();}
 }
});


test('actual POS document loads the display editor without a fixture-injected script',async()=>{
 const index=await readFile(new URL('../apps/web/public/pos/index.html',import.meta.url),'utf8');
 const browser=await engine.launch({headless:true}),page=await browser.newPage();const loaded=[];
 await page.route('https://entrypoint.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/pos/')return route.fulfill({contentType:'text/html',body:index});
  if(path.startsWith('/api/'))return route.fulfill({status:401,json:{error:'Fixture: not signed in'}});
  if(/\.(js|css)$/.test(path)){
   try{const body=await readFile(new URL('../apps/web/public'+path,import.meta.url),'utf8');loaded.push(path);return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':'text/css',body});}catch{return route.abort();}
  }
  return route.abort();
 });
 try{
  await page.goto('https://entrypoint.test/pos/');
  assert(loaded.includes('/pos/displays.js'),'real HTML requested the editor asset');
  assert.equal(await page.evaluate(()=>typeof window.renderDisplaySettings),'function');
  assert.equal(await page.evaluate(()=>typeof window.showModule),'function');
 }finally{await browser.close();}
});

test('fixed counter player shows the ordering QR and live pickup numbers in landscape and portrait',async()=>{
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let ready=false,removed=false,orientation='landscape',restaurantLogo=null;
  const businessLogo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAABzElEQVR4nO3cv03DQBhAcYyisAhLUGUCJLKAd0AswAbZwWWaCFFReghEQUETKXXKpKKg9t35D/bd0/vVdvRJT58jW5ar4/l0I67bpQfQ/zIwnIHhDAxnYDgDwxkYbjXgnE29nXwOJWqbQ6/jq14POkybifTMqYFNm6GUzEn/wdbNU0qXeGDr5ixaJxLYuvkLN/I2CS4U2PUtRaCUGwzXGdj1LUtXLzcYzsBwBoYzMJyB4QwMZ2A4A8MNeaMjK3fr9ee+jR72+Fx//XzPME9u3GA4A8MZGM7AcAaGMzCcgeEMDGdgOAPDGRjOwHAGhjMwnIHhDAxnYDgDwxkYzsBwBoYzMJyB4QwMZ2A4A8MZGM7AcAaGMzCcgeEMDGdgOAPDGRjOwHAGhiv+KzuJ3nfNmNPf2o+X3etEs8zKDYYzMJyB4QwMZ2A4A8MZGM7AcMU/6Lhcr/dPD0tPkS83GM7AcAaGMzCcgeEMDGdgOAPDGRjOwHCdgdvmMOccGqmrlxsMFwrsEpciUMoNhosEdonzF24U32Ab5yxaJ+kSbeM8pXSpjudT+i9u6u2IeTSZ9JXrF/iPmRfU92o6JLAK4m0SnIHhDAxnYDgDwxkY7hfzME1eeUlUuAAAAABJRU5ErkJggg==';
  // Fixed QR fixture; real encoder output is covered by the database integration test.
  const qr='data:image/png;base64,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';
  await page.route('https://counter.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/api/v1/display-player/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'pickup',restaurantName:'Café Linden',restaurantLogo,counterName:'Theke 1',orientation,qr,orders:removed?[]:[{number:'042',ready}]})});
   const files={'/display/index.html':'index.html','/display/player.js':'player.js','/display/player.css':'player.css'};
   if(files[path])return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../apps/web/public/display/'+files[path],import.meta.url),'utf8')});
   return route.abort();
  });
  for(const size of [{width:1280,height:720},{width:720,height:1280}]){
   orientation=size.width<size.height?'portrait':'landscape';await page.setViewportSize(size);await page.goto('https://counter.test/display/index.html#'+'a'.repeat(48));
   await page.locator('.pickup-numbers strong').waitFor();assert.equal(await page.locator('.pickup-columns section').first().getByText('042').count(),1);
   assert.equal(await page.locator('.pickup aside img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('.pickup-logo').count(),0);assert.equal(await page.locator('body').innerText().then(text=>text.includes('Bringness')),false);
   assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 245, 239)');
   for(const grid of await page.locator('.pickup-numbers').all())assert.equal(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2,'each status has exactly two number columns');
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/pickup-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+orientation+'.png'});}
  }
  restaurantLogo=businessLogo;await page.reload();await page.locator('.pickup-logo img').waitFor();assert.equal(await page.locator('.pickup-logo img').evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.equal(await page.locator('.pickup h1').innerText(),'Café Linden');
  if(process.env.RUNNER_TEMP)await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/pickup-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-business-logo.png'});
  restaurantLogo='https://foreign.example/logo.svg';await page.reload();await page.locator('.pickup').waitFor();assert.equal(await page.locator('.pickup-logo').count(),0,'external logos are not loaded');
  ready=true;await page.locator('.pickup-columns section').nth(1).getByText('042').waitFor({timeout:10000});
  removed=true;await page.waitForFunction(()=>!document.querySelector('.pickup-numbers strong'),{},{timeout:10000});
  assert.equal(await page.locator('.pickup aside img').count(),1);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

test('display editor saves pickup selection and restores the same player after a delayed reply',async()=>{
 const browser=await engine.launch({headless:true}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const counter='33333333-3333-4333-8333-333333333333',screen='44444444-4444-4444-8444-444444444444',token='a'.repeat(48);
 let saved={id:screen,token,name:'Theke',mode:'content',counterTableId:null,orientation:'landscape',fit:'contain',playlist:[]},release,started;
 const gate=new Promise(r=>release=r),saving=new Promise(r=>started=r);
 await page.route('https://display-save.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/pos/')return route.fulfill({contentType:'text/html',body:'<select id="restaurant"><option value="'+restaurant+'">Betrieb</option></select><div id="moduleBody"></div><script src="/pos/displays.js"></script><script>renderDisplaySettings()</script>'});
  if(path==='/pos/displays.js')return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../apps/web/public/pos/displays.js',import.meta.url),'utf8')});
  let body;
  if(path==='/api/v1/bootstrap')body={restaurants:[{id:restaurant,name:'Betrieb'}],products:[],categories:[]};
  else if(path.endsWith('/branding'))body={restaurant:{name:'Betrieb'}};
  else if(path==='/api/v1/displays/counters')body={counters:[{id:counter,name:'Theke 1'}]};
  else if(path==='/api/v1/displays/media')body={media:[]};
  else if(path==='/api/v1/displays/pickup')body={orders:[]};
  else if(path==='/api/v1/displays/'+screen){started();await gate;saved={...JSON.parse(route.request().postData()),id:screen,token};body={id:screen,token};}
  else if(path==='/api/v1/displays')body={displays:[saved]};
  else if(path==='/api/v1/display-player/'+token)body={...saved,restaurantName:'Betrieb',counterName:'Theke 1',orders:[],products:[]};
  else if(path.startsWith('/display/')){const file=path.split('/').pop();if(['index.html','player.js','player.css'].includes(file))return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../apps/web/public/display/'+file,import.meta.url),'utf8')});}
  if(body!==undefined)return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  return route.abort();
 });
 try{
  await page.goto('https://display-save.test/pos/');await page.locator('#displayForm').waitFor();
  // Submit initiates a delayed content save. Editing or changing screens during it must be impossible.
  await page.getByRole('button',{name:'Anzeigen',exact:true}).click();await saving;
  for(const selector of ['[name=mode]','#displaySelect','#displayNew'])assert.equal(await page.locator(selector).isDisabled(),true);
  release();await page.getByText(/Dauerhaft auf dem Server gespeichert/).waitFor();
  await page.locator('[name=mode]').selectOption('pickup');
  assert.equal(await page.locator('[name=counterTableId]').count(),0);
  await page.waitForFunction(()=>document.querySelector('[name=mode]').disabled===false&&document.querySelector('#displayStatus').textContent.includes('Dauerhaft'));
  assert.equal(saved.mode,'pickup');assert.equal(saved.counterTableId,undefined);assert.equal(saved.token,token);
  await page.reload();await page.locator('#displayForm').waitFor();
  assert.equal(await page.locator('[name=mode]').inputValue(),'pickup');assert.equal(await page.locator('[name=counterTableId]').count(),0);
  const url=await page.locator('#displayLink a').getAttribute('href');assert.equal(url,'/display/index.html#'+token);
  await page.goto('https://display-save.test'+url);await page.locator('.pickup').waitFor();assert.equal(await page.locator('.pickup h1').innerText(),'Betrieb');assert.deepEqual(errors,[]);
 }finally{release();await browser.close()}
});

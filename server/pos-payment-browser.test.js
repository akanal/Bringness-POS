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
 const operationsFiles=Object.fromEntries(await Promise.all(['operations.html','device-checks.js','operations.js','operations.css'].map(async f=>[f,await readFile(new URL('../apps/web/public/pos/'+f,import.meta.url),'utf8')])));
 const personnel=await readFile(new URL('../apps/web/public/pos/personnel.js',import.meta.url),'utf8');
 assert.match(index,/<script\b[^>]*src="\/pos\/displays\.js(?:\?[^"]*)?"/, 'actual POS document must load the editor');
 const {moduleCatalog}=await import('./module-catalog.js');
 const baseStyles=(await Promise.all(['styles.css','category-colors.css','pos/sale-tools.css','pos/trade.css','pos/colors.css'].map(path=>readFile(new URL('../apps/web/public/'+path,import.meta.url),'utf8'))));
 const navigation=app.slice(app.indexOf('const moduleInfo='),app.indexOf('async function downloadReceipt'));
 const licensing=app.split('\n').find(line=>line.startsWith('async function renderLicensing'));
 const bootstrap={restaurants:[{id:restaurant,name:'Testbetrieb',mode:'restaurant'}],categories:[],products:[]};
 const state={features:{pos_base:true,display_control:true,restaurant:true},featureRows:[],plans:[{code:'pos_base_monthly',active:true,eligible:false,amount:34.99},...Object.entries(moduleCatalog).map(([code,plan])=>({code,active:false,eligible:!plan.requires.includes('table_management'),requires:plan.requires,amount:plan.netCents/100})),{code:'display_control_monthly',active:true,included:true,eligible:false,amount:14.99},{code:'personnel_monthly',active:false,eligible:true,amount:9.99},{code:'table_qr_monthly',active:false,eligible:false,requires:['pos_base','table_management'],amount:29.99}]};
 const restaurantChange=app.split('\n').find(line=>line.startsWith('$(')&&line.includes('"restaurant").onchange='));
 const branding=app.slice(app.indexOf('async function renderRestaurantBranding('),app.indexOf('let guestPresencePolling='));
 const fixtureScript=`let data=${JSON.stringify(bootstrap)};let cat='all';let cart=[{id:'kept-cart',qty:2}];const $=id=>document.getElementById(id);function isRestaurantMode(){return false}function applyBusinessMode(){}function render(){$('restaurant').dataset.posSelectedRestaurant=$('restaurant').value}function money(n){return n.toFixed(2)+' EUR'}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}localStorage.setItem('bringness-pos-token','fixture-session');window.posPackageFeatures=${JSON.stringify(state.features)};${branding}async function api(path){if(path.endsWith('/branding'))return {restaurant:{id:'${restaurant}',name:'Testbetrieb',logo_data:null}};if(path.endsWith('/qr-service'))return {mode:'pickup'};if(path==='/billing/status')return ${JSON.stringify(state)};if(path==='/licensing')return {plans:[]};if(path==='/billing/invoices')return {invoices:[]};if(path==='/billing/profile')return {profile:{}};if(path==='/license/status')return {};if(path==='/billing/owner-email')return {email:'owner@example.test',verified:true};throw Error('Unexpected fixture request: '+path)};${navigation}\n${licensing}\n${restaurantChange}`;
 for(const width of [390,1280]){
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));let inventoryReads=0,deviceReads=0;let holdInventory=false,releaseInventory=null,loseInventoryAck=false;const inventoryReceipts=new Map();let unlocks=0,locks=0,inventoryWrites=0,inventoryRow={id:product,name:'Einstellungsartikel',revision:null,counted_units:null,minimum_units:null,target_units:null,counted_at:null};
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
   const operationsFile=path.split('/').at(-1);if(operationsFiles[operationsFile])return route.fulfill({contentType:operationsFile.endsWith('.html')?'text/html':operationsFile.endsWith('.css')?'text/css':'text/javascript',body:operationsFiles[operationsFile]});
   if(path==='/api/v1/pos-device-checks'){deviceReads++;return route.fulfill({json:{restaurantId:new URL(route.request().url()).searchParams.get('restaurantId'),companyId:'33333333-3333-4333-8333-333333333333',asOf:'0',rows:[],nextCursor:null}});}
   if(path==='/api/v1/pos-inventory'){inventoryReads++;if(route.request().method()==='GET')return route.fulfill({json:{restaurantId:new URL(route.request().url()).searchParams.get('restaurantId'),rows:[inventoryRow],manualCounts:true}});const c=route.request().postDataJSON();if(!inventoryReceipts.has(c.requestId)){inventoryWrites++;inventoryRow={...inventoryRow,revision:c.expectedRevision+1,counted_units:c.countedUnits,minimum_units:c.minimumUnits,target_units:c.targetUnits,counted_at:'2026-11-07T09:00:00Z'};inventoryReceipts.set(c.requestId,{requestId:c.requestId,productId:product,revision:inventoryRow.revision});}if(holdInventory)await new Promise(resolve=>{releaseInventory=resolve;});if(loseInventoryAck){loseInventoryAck=false;return route.abort('failed');}return route.fulfill({json:inventoryReceipts.get(c.requestId)});}
   if(path==='/api/v1/bootstrap')return route.fulfill({json:route.request().frame().parentFrame()?{...bootstrap,restaurants:[{id:product,name:'Anderer Betrieb'},...bootstrap.restaurants]}:bootstrap});
   if(path==='/pos/licensing.css')return route.fulfill({contentType:'text/css',body:css});
   return route.abort();
  });
  try{
   await page.goto('https://modules.test/pos/');
   await page.getByRole('button',{name:'PIN vergessen?',exact:true}).waitFor();
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/pin-recovery-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png'});}
   await page.getByRole('button',{name:'PIN vergessen?',exact:true}).click();
   await page.getByRole('heading',{name:'Verwaltungs-PIN neu setzen',exact:true}).waitFor();
   assert(await page.locator('.personnel-dialog input[name=password]').isVisible());assert.equal(unlocks,0,'forgotten PIN cannot unlock settings');
   await page.locator('.personnel-overlay [data-close]').click();
   await page.evaluate(()=>{void showModule('einstellungen')});
   await page.locator('.personnel-dialog input[name=pin]').fill('123456');await page.getByRole('button',{name:'Freigeben',exact:true}).click();await page.locator('#openDisplaySettings').waitFor();
   const cards=await page.locator('#moduleBody > .modulecard').evaluateAll(nodes=>nodes.map(n=>({title:n.querySelector('h3,summary')?.textContent,width:n.getBoundingClientRect().width,x:n.getBoundingClientRect().x,bottom:n.getBoundingClientRect().bottom,top:n.getBoundingClientRect().top})));
   assert.deepEqual(cards.slice(-2).map(c=>c.title),['Steuern & Finanzamt','Tests']);
   const displayCard=cards.find(c=>c.title==='Displaysteuerung');
   for(const title of ['QR-Bestellmodell','QR-Code & Center','Betriebsart','Restaurantname und QR-Logo']){const c=cards.find(c=>c.title===title);assert(c,title+' exists');assert(Math.abs(c.width-displayCard.width)<2,title+' matches display width');assert(Math.abs(c.x-displayCard.x)<2,title+' aligns');}
   for(let i=1;i<cards.length;i++)assert(cards[i].top-cards[i-1].bottom>=10,'consistent visible card gaps');
   assert(await page.locator('#businessMode').evaluate(n=>getComputedStyle(n).paddingTop==='11px'));
   assert(await page.locator('#qr-code a').evaluate(n=>getComputedStyle(n).display==='inline-flex'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.locator('#brandingName').fill('Unveränderter Entwurf');
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/settings-aligned-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}

   assert.equal(await page.locator('#posSettingsOperations').getAttribute('open'),null);await page.locator('#posSettingsOperations > summary').click();const operations=page.frameLocator('#posSettingsOperations iframe');await operations.getByRole('button',{name:'Betrieb für Tests laden',exact:true}).click();await operations.locator('#status').filter({hasText:'Betrieb für Geräteprüfungen geladen'}).waitFor();assert.equal(await operations.locator('#restaurant').inputValue(),restaurant);
   assert.equal(await operations.locator('#inventory').isVisible(),false);assert.equal(await operations.locator('#inventory-history').isVisible(),false);assert.equal(await operations.locator('.test-group').count(),4);assert.equal(await operations.locator('.test-group[open]').count(),0);assert.equal(inventoryReads,0);assert.equal(inventoryWrites,0);
   const fiscal=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Steuern & Finanzamt'})}).first();assert.equal(await fiscal.getAttribute('open'),null);await fiscal.locator('summary').click();assert(await page.locator('#openFiscalSettings').isVisible());await fiscal.locator('summary').click();assert.equal(await page.locator('#brandingName').inputValue(),'Unveränderter Entwurf');
   await operations.getByText('Gespeicherte Geräte-Prüfprotokolle',{exact:true}).click();await operations.locator('#device-load').click();await operations.locator('#device-scanner-label:not([disabled])').waitFor({state:'attached'});assert.match(await operations.locator('#device-status').textContent(),/Benutzerprotokolle|Prüfprotokolle/);assert.equal(deviceReads,1);
   const scanner=operations.locator('.test-group').filter({has:operations.locator('summary').filter({hasText:'Scanner testen'})});await scanner.locator('summary').focus();await scanner.locator('summary').press('Enter');await operations.locator('#scan').fill('IN-SETTINGS');await operations.locator('#scan').press('Enter');assert.match(await operations.locator('#scan-result').textContent(),/Code empfangen: IN-SETTINGS/);
   await operations.locator('#device-scanner-label').fill('Tresen');await scanner.locator('summary').click();assert.equal(await operations.locator('#device-scanner-label').isVisible(),false);await scanner.locator('summary').click();assert.equal(await operations.locator('#device-scanner-label').inputValue(),'Tresen');
   page.once('dialog',dialog=>dialog.dismiss());await page.locator('#openDisplaySettings').click();assert.equal(await operations.locator('#device-scanner-label').inputValue(),'Tresen');assert.equal(await page.evaluate(()=>cart[0].id),'kept-cart');assert.equal(page.url(),'https://modules.test/pos/');assert.equal(page.context().pages().length,1);assert.equal(await operations.locator('header').isVisible(),false);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const before=await page.locator('#posSettingsOperations iframe').evaluate(f=>f.style.height);await page.evaluate(()=>dispatchEvent(new MessageEvent('message',{origin:'https://untrusted.test',source:document.querySelector('#posSettingsOperations iframe').contentWindow,data:{type:'bringness:pos-operations-height',height:19000}})));assert.equal(await page.locator('#posSettingsOperations iframe').evaluate(f=>f.style.height),before);
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/settings-tests-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}
   page.once('dialog',dialog=>dialog.accept());await page.locator('#openDisplaySettings').click();await page.locator('#displayForm').waitFor();assert.equal(await page.locator('#posSettingsOperations').count(),0);assert.equal(inventoryReads,0);assert.equal(inventoryWrites,0);assert.equal(unlocks,1);assert.equal(locks,0);await page.locator('#moduleBack').click();await page.locator('#openDisplaySettings').waitFor();
   await page.getByRole('button',{name:'Module verwalten',exact:true}).click();
   const owned=page.locator('[data-license-plan="display_control_monthly"]');await owned.waitFor();
   assert.match(await owned.innerText(),/Bereits enthalten/);assert.equal(await owned.locator('[data-buy-plan]').count(),0);
   assert(await page.locator('[data-buy-plan="personnel_monthly"]').isVisible());assert.equal(await page.locator('[data-buy-plan="table_qr_monthly"]').isEnabled(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'module cards must fit viewport');
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}
   await page.locator('#openOwnedDisplay').click();await page.locator('#displayForm').waitFor();assert(await page.getByRole('heading',{name:'Bildschirme',exact:true}).isVisible());assert.deepEqual(errors,[]);assert.equal(unlocks,1,'one administrative PIN for settings and display subpages');assert.equal(locks,0);
   // The tests picker follows the parent business and keeps unsaved device input guarded.
   await page.evaluate(()=>showModule('einstellungen'));await page.locator('#openDisplaySettings').waitFor();await page.locator('#posSettingsOperations > summary').click();const switched=page.frameLocator('#posSettingsOperations iframe');await switched.locator('#load').click();await switched.getByText('Gespeicherte Geräte-Prüfprotokolle',{exact:true}).click();await switched.locator('#device-load').click();await switched.locator('#device-scanner-label:not([disabled])').waitFor({state:'attached'});await switched.getByText('Scanner testen',{exact:true}).click();await switched.locator('#device-scanner-label').fill('Nicht gespeichert');await page.evaluate(({old,next})=>{const select=document.getElementById('restaurant');select.dataset.posSelectedRestaurant=old;const option=document.createElement('option');option.value=next;option.textContent='Zweiter Betrieb';select.append(option);},{old:restaurant,next:product});
   page.once('dialog',dialog=>dialog.dismiss());await page.locator('#restaurant').selectOption(product);assert.equal(await page.locator('#restaurant').inputValue(),restaurant);assert.equal(await switched.locator('#device-scanner-label').inputValue(),'Nicht gespeichert');
   page.once('dialog',dialog=>dialog.accept());await page.locator('#restaurant').selectOption(product);await page.waitForFunction(id=>document.querySelector('#posSettingsOperations iframe')?.getAttribute('src').includes('restaurantId='+id),product);await page.locator('#posSettingsOperations > summary').click();await switched.locator('#load').click();await switched.locator('#status').filter({hasText:'Betrieb für Geräteprüfungen geladen'}).waitFor();assert.equal(await switched.locator('#restaurant').inputValue(),product);assert.equal(await page.locator('#restaurant').inputValue(),product);assert.equal(await page.evaluate(()=>cart.length),0);assert.equal(inventoryReads,0);assert.equal(inventoryWrites,0);assert.deepEqual(errors,[]);
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
  const names=await page.evaluate(()=>{
   const restaurantName='Café & <img src=x onerror="alert(1)">',categoryName='Food & </option><option data-pos-injected="yes" value="other">Fremd</option>';
   data={restaurants:[{id:'11111111-1111-4111-8111-111111111111',name:restaurantName,mode:'restaurant'}],categories:[{id:'22222222-2222-4222-8222-222222222222',restaurantId:'11111111-1111-4111-8111-111111111111',name:categoryName}],products:[],orders:[]};render();
   return {restaurantName,categoryName,restaurantText:document.querySelector('#restaurant option').textContent,categoryText:document.querySelector('#productCategory option').textContent,injected:document.querySelectorAll('[data-pos-injected]').length,options:document.querySelector('#productCategory').options.length};
  });
  assert.equal(names.restaurantText,names.restaurantName);assert.equal(names.categoryText,names.categoryName);assert.equal(names.injected,0);assert.equal(names.options,1);
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

test('ready pickup numbers expire offline using server time while preparation remains',async()=>{
 const browser=await engine.launch({headless:true}),page=await browser.newPage();let first=true;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://pickup-expiry.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/v1/display-player/')){
   if(!first)return route.abort();first=false;
   const serverNow=Date.now()+86400000;
   return route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'pickup',restaurantName:'Testbetrieb',serverTime:new Date(serverNow).toISOString(),orders:[{number:'002',ready:true,expiresAt:new Date(serverNow+1500).toISOString()},{number:'001',ready:false,expiresAt:null}]})});
  }
  const file=path.split('/').pop();if(['index.html','player.js','player.css'].includes(file))return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../apps/web/public/display/'+file,import.meta.url),'utf8')});
  return route.abort();
 });
 try{await page.goto('https://pickup-expiry.test/display/index.html#'+'b'.repeat(48));await page.locator('.pickup-ready').getByText('002',{exact:true}).waitFor();
  await page.locator('.pickup-ready').getByText('002',{exact:true}).waitFor({state:'detached',timeout:6000});
  assert.equal(await page.locator('.pickup-preparing').getByText('001',{exact:true}).count(),1);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

test('pickup statuses fill down the left column then down the right on resize',async()=>{
 const browser=await engine.launch({headless:true}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://column-flow.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/v1/display-player/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'pickup',restaurantName:'Testbetrieb',orders:[false,true].flatMap(ready=>Array.from({length:30},(_,i)=>({number:(ready?'R':'P')+String(30-i).padStart(3,'0'),ready})))})});
  const file=path.split('/').pop();if(['index.html','player.js','player.css'].includes(file))return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../apps/web/public/display/'+file,import.meta.url),'utf8')});
  return route.abort();
 });
 try{await page.goto('https://column-flow.test/display/index.html#'+'c'.repeat(48));await page.locator('.pickup-numbers strong').first().waitFor();
  for(const size of [{width:1280,height:720},{width:720,height:1280},{width:1920,height:1080}]){
   await page.setViewportSize(size);
   await page.waitForFunction(()=>[...document.querySelectorAll('.pickup-numbers')].every(grid=>{const cards=[...grid.querySelectorAll('strong')],gap=parseFloat(getComputedStyle(grid).rowGap)||0,rows=Math.max(1,Math.floor((grid.clientHeight+gap)/(cards[0].getBoundingClientRect().height+gap)));return cards.every((card,i)=>Number(card.style.gridRow)===Math.floor(i/(2*rows))*rows+i%rows+1&&Number(card.style.gridColumn)===Math.floor(i/rows)%2+1)}));
   for(const selector of ['.pickup-preparing','.pickup-ready']){
    const grid=page.locator(selector+' .pickup-numbers');
    const geometry=await grid.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,cards:[...el.querySelectorAll('strong')].map(c=>({x:c.offsetLeft,y:c.offsetTop,col:Number(c.style.gridColumn),row:Number(c.style.gridRow)}))}));
    assert.equal(geometry.cards.length,30,'older active numbers remain available');assert.equal(geometry.cards[0].col,1);assert.equal(geometry.cards[0].row,1);
    const right=geometry.cards.findIndex(c=>c.col===2);assert(right>1,'visible left column holds several numbers');
    assert.equal(geometry.cards[1].x,geometry.cards[0].x);assert(geometry.cards[1].y>geometry.cards[0].y);
    assert(geometry.cards[right].x>geometry.cards[0].x);assert.equal(geometry.cards[right].y,geometry.cards[0].y);
    assert(geometry.scroll>geometry.height,'overflow remains scrollable rather than discarded');
   }
   if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/pickup-column-flow-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+size.width+'.png'});}
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

test('waiter removal reaches shared TV immediately and guest deposit survives checkout and reload',async()=>{
 const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:900}}),errors=[];
 const waiter=await context.newPage(),tv=await context.newPage(),guest=await context.newPage();for(const p of [waiter,tv,guest])p.on('pageerror',e=>errors.push(e.message));
 const order='33333333-3333-4333-8333-333333333333',request='44444444-4444-4444-8444-444444444444',table='55555555-5555-4555-8555-555555555555';let hidden=false,fail=false;const mutations=[];
 const files=new Map();for(const path of ['/service/index.html','/service/app.js','/service/style.css','/personnel-report.js','/display/index.html','/display/player.js','/display/player.css','/tisch/index.html','/tisch/app.js','/tisch/collection.js','/tisch/guest-enhancements.js'])try{files.set(path,await readFile(new URL('../apps/web/public'+path,import.meta.url),'utf8'));}catch{}
 await context.addInitScript(()=>{if(location.hostname==='pickup.test')localStorage.setItem('bringness-waiter-token','waiter')});
 await context.route('https://pickup.test/**',async route=>{const u=new URL(route.request().url()),p=u.pathname;const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(p.endsWith('/display-visibility')){const b=route.request().postDataJSON();mutations.push(b);if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Offline fixture'})});hidden=b.hidden;return json({ok:true,hidden,undoAllowed:hidden});}
  if(p.startsWith('/api/v1/display-player/'))return json({mode:'pickup',restaurantName:'Fixture',orientation:'landscape',counterName:'Abholung',serverTime:new Date().toISOString(),orders:hidden?[]:[{number:'077',ready:true,expiresAt:new Date(Date.now()+1800000).toISOString()}]});
  if(p==='/api/v1/waiter/bootstrap')return json({name:'Ada',employee:{id:restaurant,restaurant_id:restaurant,restaurant_name:'Fixture',duty_state:'working',stamp_pin_digits:4},products:[],tables:[]});
  if(p==='/api/v1/waiter/qr-orders')return json({orders:[]});
  if(p==='/api/v1/qr-service/display-queue')return json({orders:hidden?[]:[{id:order,pickup_number:77,source:'qr',status:'paid',qr_service_mode:'pickup',qr_ready_at:new Date().toISOString(),displayOnly:true,table_name:'Tisch 1',total_cents:1650,items:[]}]});
  if(p==='/api/v1/guest/menu')return json({restaurant:'Fixture',table:'1',products:[{id:product,name:'Getränk',category:'Getränke',price_cents:1600,deposit_cents:50}]});
  if(p==='/api/v1/guest/service-mode')return json({mode:'pickup'});
  if(p==='/api/v1/guest/order-v2'){const b=route.request().postDataJSON();assert.equal(b.depositCents,50);return json({orderId:order,number:'077',totalCents:1650});}
  if(p==='/api/v1/guest/collection')return json({orderId:order,number:'077',depositCents:50,mode:'pickup',ready:false,collected:false,closed:false});
  if(p==='/api/v1/guest/extras'||p==='/api/v1/waiter/extras')return json({extras:[]});
  if(p.startsWith('/api/'))return json({orders:[]});
  const file=p==='/service/'?'/service/index.html':p==='/tisch/'?'/tisch/index.html':p;let body=files.get(file);if(body!==undefined){if(file==='/tisch/index.html')body=body.replace('</body>','<script src="/tisch/collection.js"></script><script src="/tisch/guest-enhancements.js"></script></body>');return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body});}return route.abort();
 });
 try{
  await waiter.goto('https://pickup.test/service/');await waiter.locator('[data-dismiss]').waitFor();await tv.goto('https://pickup.test/display/index.html#'+'a'.repeat(48));await tv.getByText('077',{exact:true}).waitFor();
  await waiter.locator('[data-dismiss]').click();await waiter.waitForFunction(()=>!document.querySelector('[data-qr-card]'));await tv.waitForFunction(()=>!document.getElementById('screen').textContent.includes('077'));assert.equal(mutations.length,1);assert.equal(mutations[0].hidden,true);
  await waiter.getByRole('button',{name:'Rückgängig',exact:true}).click();await waiter.locator('[data-dismiss]').waitFor();await tv.getByText('077',{exact:true}).waitFor();assert.equal(mutations[1].hidden,false);assert.equal(mutations[1].requestId,mutations[0].requestId);
  fail=true;await waiter.locator('[data-dismiss]').click();await waiter.waitForFunction(()=>document.getElementById('message').textContent.includes('Anzeige nicht entfernt'));assert.equal(await waiter.locator('[data-qr-card]').count(),1);assert.equal(hidden,false);
  await guest.goto('https://pickup.test/tisch/?code='+'a'.repeat(48));await guest.locator('#menu [data-add]').click();await guest.getByText(/Davon Pfand:.*0,50/).first().waitFor();assert.match(await guest.locator('#total').textContent(),/16,50/);await guest.locator('#send').click();await guest.locator('#guestDepositSummary').waitFor();assert.match(await guest.locator('#guestDepositSummary').textContent(),/Pfand:.*0,50/);await guest.reload();await guest.locator('#guestDepositSummary').waitFor();assert.match(await guest.locator('#guestDepositSummary').textContent(),/Pfand:.*0,50/);assert(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await guest.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/guest-deposit-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'.png'});}
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

test('POS introduction presents the complete system and prepares a private mail draft at mobile and desktop widths',async()=>{
 const document=await readFile(new URL('../apps/web/public/vorfuehrung/index.html',import.meta.url),'utf8');
 const assets={};for(const name of ['style.css','app.js'])assets[name]=await readFile(new URL('../apps/web/public/vorfuehrung/'+name,import.meta.url),'utf8');
 const browser=await engine.launch({headless:true});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://pos-intro.test/**',route=>{const path=new URL(route.request().url()).pathname;requests.push(path);if(path==='/vorfuehrung/')return route.fulfill({contentType:'text/html',body:document});const name=path.split('/').pop();if(assets[name])return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/css',body:assets[name]});return route.abort()});
  await page.goto('https://pos-intro.test/vorfuehrung/');
  for(const name of ['Kasse & Artikel','Tische & QR-Bestellung','Kellnerbestellungen','Küchenübersicht','Personal & Dienstplan','Belege & Rechnungen','Schicht & Auswertungen','Bildschirme & Abholung'])assert(await page.getByRole('heading',{name,exact:true}).isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'content fits viewport');
  if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/pos-introduction-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}
  await page.getByRole('tab',{name:'Tisch & Küche',exact:true}).click();assert.match(await page.locator('#example').innerText(),/Küche verfolgen/);
  await page.getByRole('tab',{name:'Team & Schicht',exact:true}).click();assert.match(await page.locator('#example').innerText(),/Stempel-PIN/);
  await page.getByLabel('Betrieb *',{exact:true}).fill('Café Beispiel & Co');await page.getByLabel('Dein Name *',{exact:true}).fill('<Demo Person>');
  await page.getByLabel('E-Mail für die Rückmeldung *',{exact:true}).fill('kein-email');await page.getByRole('button',{name:'E-Mail-Anfrage vorbereiten',exact:true}).click();assert.equal(await page.locator('#draftbox').isVisible(),false);
  await page.getByLabel('E-Mail für die Rückmeldung *',{exact:true}).fill('demo+test@example.test');await page.getByRole('button',{name:'E-Mail-Anfrage vorbereiten',exact:true}).click();assert(await page.locator('#draftbox').isVisible());
  const href=await page.locator('#mailLink').getAttribute('href'),mail=new URL(href);assert.equal(mail.protocol,'mailto:');assert.equal(mail.pathname,'info@bringness.de');assert.match(mail.searchParams.get('body'),/Gesamtsystem kennenlernen/);assert.match(mail.searchParams.get('body'),/<Demo Person>/);assert.equal(await page.locator('#draftbox script').count(),0);
  assert.deepEqual(requests.filter(p=>p.startsWith('/api/')),[],'no personal information is sent to an API');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close()}
});

test('guided cash close reviews before committing, rejects changed snapshots and downloads the saved CSV',async()=>{
 const baseCss=(await Promise.all(['styles.css','pos/sale-tools.css','pos/colors.css'].map(p=>readFile(new URL('../apps/web/public/'+p,import.meta.url),'utf8')))).join('\n');const source=await readFile(new URL('../apps/web/public/pos/cash-closing.js',import.meta.url),'utf8'),index=await readFile(new URL('../apps/web/public/pos/index.html',import.meta.url),'utf8'),styles=[...index.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m=>m[0]).join('');
 for(const width of[390,1280]){
  const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];let writes=[],reject=true;const active={id:product,opening_cents:1000,expectedCents:1200,opened_at:'2026-11-07T08:00:00Z',closed_at:null,payments:[{method:'cash',mode:'retail',amount_cents:200}],movements:[],reviewToken:'a'.repeat(64)};let sessions=[active];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('https://cash-close.test/**',async route=>{const u=new URL(route.request().url());if(u.pathname==='/pos/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<style>'+baseCss+'</style><div class="posapp"><select id="restaurant"><option value="'+restaurant+'">Testbetrieb</option></select><div id="moduleBody"></div></div><script>'+api+'</script><script src="/cash-closing.js"></script><script>renderCashClosing()</script>'});if(u.pathname==='/cash-closing.js')return route.fulfill({contentType:'text/javascript',body:source});if(u.pathname==='/api/v1/cash-sessions'){if(route.request().method()==='GET')return route.fulfill({json:{sessions}});const body=route.request().postDataJSON();writes.push(body);if(reject)return route.fulfill({status:409,json:{error:'Kassenstand hat sich seit der Prüfung geändert.'}});sessions=[{...active,closed_at:'2026-11-07T09:00:00Z',countedCents:body.amountCents,differenceCents:-100,reason:body.reason}];return route.fulfill({json:{session:sessions[0]}});}return route.abort();});
  try{await page.goto('https://cash-close.test/pos/');await page.locator('[data-amount]').fill('11,00');await page.getByRole('button',{name:'Abschluss prüfen',exact:true}).click();await page.locator('[data-status]').filter({hasText:'Kassendifferenz begründen'}).waitFor();assert.equal(writes.length,0);await page.locator('[data-reason]').fill('Zählung bestätigt');await page.getByRole('button',{name:'Abschluss prüfen',exact:true}).click();await page.locator('[data-confirm-close]').waitFor();assert.equal(writes.length,0);assert.match(await page.locator('[data-review]').innerText(),/-1,00/);if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/cash-closing-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.locator('[data-confirm-close]').click();await page.locator('[data-status]').filter({hasText:'seit der Prüfung geändert'}).waitFor();assert.equal(sessions[0].closed_at,null);reject=false;await page.getByRole('button',{name:'Abschluss prüfen',exact:true}).click();await page.locator('[data-confirm-close]').click();await page.getByRole('button',{name:'Abschluss als CSV exportieren',exact:true}).waitFor();assert.equal(writes.length,2);assert.equal(writes[1].reviewToken,'a'.repeat(64));const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Abschluss als CSV exportieren',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^Bringness-Kassenschicht-.*\.csv$/);const stream=await download.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);const csv=Buffer.concat(chunks).toString('utf8');assert.ok(csv.includes('"Gezählt Cent";"1100"'));assert.ok(csv.includes('"Differenz Cent";"-100"'));assert.ok(csv.includes('kein fiskalischer'));assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 }
});

test('POS inventory and device checks keep manual counts, real input and user print acknowledgement separate',async()=>{
 const files=Object.fromEntries(await Promise.all(['operations.html','device-checks.js','operations.js','operations.css'].map(async f=>[f,await readFile(new URL('../apps/web/public/pos/'+f,import.meta.url),'utf8')])));
 for(const width of[390,1280]){const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));let row={id:product,name:'=Testprodukt',revision:null,counted_units:null,minimum_units:null,target_units:null,counted_at:null};
 await page.route('https://pos-operations.test/**',async route=>{const u=new URL(route.request().url());const name=u.pathname.split('/').at(-1);if(files[name])return route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:files[name]});if(u.pathname==='/api/v1/bootstrap'){assert.equal(route.request().headers().authorization,'Bearer pos-fixture');return route.fulfill({json:{restaurants:[{id:restaurant,name:'Testbetrieb'}]}});}if(u.pathname==='/api/v1/pos-inventory'){if(route.request().method()==='GET')return route.fulfill({json:{restaurantId:restaurant,rows:[row],manualCounts:true}});const c=route.request().postDataJSON();row={...row,revision:c.expectedRevision+1,counted_units:c.countedUnits,minimum_units:c.minimumUnits,target_units:c.targetUnits,counted_at:'2026-11-07T09:00:00Z'};return route.fulfill({json:{requestId:c.requestId,productId:product,revision:row.revision}});}return route.abort();});
 try{await page.goto('https://pos-operations.test/pos/operations.html');await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','pos-fixture');localStorage.setItem('bringness-shop-token','untouched-shop');window.print=()=>{window.testPrintCalls=(window.testPrintCalls||0)+1;};});await page.getByRole('button',{name:'Betriebe und Zählstände laden',exact:true}).click();await page.locator('[name=countedUnits]').fill('2');await page.locator('[name=minimumUnits]').fill('3');await page.locator('[name=targetUnits]').fill('8');await page.getByRole('button',{name:'Zählstand speichern',exact:true}).click();await page.locator('#status').filter({hasText:'Zählstand gespeichert'}).waitFor();assert.match(await page.locator('#inventory').innerText(),/Mindestbestand erreicht/);await page.locator('#scan').fill('SCANNER-123');await page.locator('#scan').press('Enter');assert.match(await page.locator('#scan-result').textContent(),/Code empfangen: SCANNER-123/);await page.locator('#paper-confirm').check();assert.match(await page.locator('#print-result').textContent(),/Noch kein/);await page.getByRole('button',{name:'Testdruck öffnen',exact:true}).click();assert.equal(await page.evaluate(()=>testPrintCalls),1);assert.match(await page.locator('#print-result').textContent(),/Druckdialog geöffnet/);await page.locator('#paper-confirm').check();assert.match(await page.locator('#print-result').textContent(),/durch Nutzer bestätigt/);assert.equal(await page.evaluate(()=>localStorage.getItem('bringness-shop-token')),'untouched-shop');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));if(process.env.RUNNER_TEMP){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.RUNNER_TEMP+'/module-previews',{recursive:true});await page.screenshot({path:process.env.RUNNER_TEMP+'/module-previews/pos-operations-'+(process.env.CENTER_TEST_BROWSER||'chromium')+'-'+width+'.png',fullPage:true});}assert.deepEqual(errors,[]);
 }finally{await browser.close();}}
});

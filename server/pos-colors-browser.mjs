import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const playwright=await import(process.env.CENTER_TEST_PLAYWRIGHT||'playwright');
const chromium=playwright[process.env.CENTER_TEST_BROWSER||'chromium'];
const fs=require('fs'),http=require('http'),assert=require('assert');
const root=new URL('../apps/web/public',import.meta.url).pathname;
const server=http.createServer((req,res)=>{try{const path=req.url.split('?')[0];if(path==='/fixture'){let html=fs.readFileSync(root+'/pos/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');res.end(html);return}res.setHeader('Content-Type',req.url.includes('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(root+path))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');await page.evaluate(()=>{document.getElementById('auth').hidden=true;document.getElementById('workspace').style.display='block';document.getElementById('kasseView').hidden=true;document.getElementById('moduleView').classList.add('show');document.getElementById('moduleView').innerHTML='<h2>Händler</h2><div id="moduleBody"></div>';document.getElementById('restaurant').innerHTML='<option value="r1">Testbetrieb</option>';window.$=id=>document.getElementById(id);window.esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');window.token='fixture';window.data={products:['Herren Pullover','Hemd','Hose','Jacke'].map((name,i)=>({id:'p'+i,name,restaurantId:'r1'}))};window.api=async path=>path.startsWith('/trade/settings')?{enabled:true}:path.startsWith('/trade/prices')?{tiers:data.products.map(p=>({product_id:p.id,min_qty:1,price_cents:1000}))}:{customers:[]};});await page.addScriptTag({url:'/pos/customer-delivery.js'});await page.addScriptTag({url:'/pos/trade.js'});await page.evaluate(()=>renderTradeModule());assert.equal(await page.locator('#moreMenu [data-view="kunden"]').count(),0);for(const width of [1366,820,390]){await page.setViewportSize({width,height:1000});assert(await page.locator('#tradePay').isVisible());assert.equal(await page.locator('#tradePay').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(173, 65, 0)');assert(await page.locator('.trade-layout').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'trade panel overflow at '+width);}// Exercise the real product renderer and real document click listener, not a direct dialog call.
 await page.setViewportSize({width:1366,height:1000});
 await page.evaluate(()=>{document.getElementById('moduleView').classList.remove('show');document.getElementById('kasseView').hidden=false;data.restaurants=[{id:'r1',name:'Testbetrieb'}];data.categories=[];data.products.forEach(p=>p.price=2.99);window.cat='all';window.applyBusinessMode=()=>{};window.productPicture=()=>'<span>🥤</span>';window.money=n=>n.toFixed(2)+' €';window.renderCart=()=>{};window.ensurePersonnelAccess=async()=>true;window.api=async()=>({rules:[]});});
 const app=fs.readFileSync(root+'/pos/app.js','utf8');
 await page.addScriptTag({content:app.slice(app.indexOf('function render(preferredRestaurantId)'),app.indexOf('window.selectCat='))});
 await page.addScriptTag({url:'/pos/deposit.js'});
 await page.evaluate(()=>render());
 for(const width of [1366,820,390]){
  await page.setViewportSize({width,height:1000});
  const card=page.locator('#products>div').first();
  await card.locator('summary').click();
  await card.locator('[data-deposit-product]').click();
  await page.locator('dialog.bn-drink-deposit').waitFor({state:'visible'});
  assert(await page.locator('dialog [data-enabled]').isVisible());
  await page.locator('dialog [data-close]').click();
  await page.locator('dialog.bn-drink-deposit').waitFor({state:'detached'});
  assert.equal(await page.locator('dialog').count(),0);
 }
 // Use the actual administrative PIN gate while the native deposit modal is open.
 let savedRule=null,depositWrites=0;
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/personnel/access'))return route.fulfill({json:{canManage:true,configured:true}});
  if(path.endsWith('/personnel/unlock')){const body=route.request().postDataJSON();return route.fulfill(body.pin==='1234'?{json:{unlockToken:'fixture-only-unlock'}}:{status:403,json:{error:'PIN falsch'}});}
  if(path.endsWith('/deposit/rules')){
   if(route.request().method()==='PUT'){assert.equal(route.request().headers()['x-personnel-unlock'],'fixture-only-unlock');savedRule=route.request().postDataJSON();depositWrites++;return route.fulfill({json:{ok:true}});}
   return route.fulfill({json:{rules:savedRule?[{product_id:savedRule.productId,amount_cents:savedRule.amountCents,units:savedRule.units,label:savedRule.label,tax_rate:savedRule.taxRate}]:[]}});
  }
  return route.fulfill({json:{ok:true}});
 });
 await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','fixture-only');window.api=async(path,options={})=>{const res=await fetch('/api/v1'+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer fixture-only'}});const body=await res.json();if(!res.ok)throw Error(body.error);return body;};});
 await page.addScriptTag({url:'/pos/personnel.js'});
 await page.setViewportSize({width:820,height:1000});
 await page.locator('#products>div').first().locator('summary').click();
 await page.locator('[data-deposit-product]').first().click();
 await page.locator('dialog [data-enabled]').check();await page.locator('dialog [data-amount]').fill('0,15');await page.locator('dialog [data-tax]').selectOption('0');
 await page.locator('dialog>form>button[type=submit]').click();
 const gate=page.locator('dialog .personnel-overlay');await gate.locator('input[name=pin]').fill('0000');
 assert(await gate.locator('input[name=pin]').evaluate(e=>document.activeElement===e),'PIN must receive focus inside native modal');
 await gate.locator('[data-close]').click();await gate.waitFor({state:'detached'});
 await page.waitForFunction(()=>!document.querySelector('dialog>form>button[type=submit]').disabled);assert.equal(depositWrites,0);
 await page.locator('dialog>form>button[type=submit]').click();await gate.locator('input[name=pin]').waitFor();await page.keyboard.press('Escape');await gate.waitFor({state:'detached'});assert(await page.locator('dialog.bn-drink-deposit').isVisible());
 await page.waitForFunction(()=>!document.querySelector('dialog>form>button[type=submit]').disabled);
 await page.locator('dialog>form>button[type=submit]').click();await gate.locator('input[name=pin]').fill('0000');await gate.locator('form button').click();
 await page.waitForFunction(()=>document.querySelector('.personnel-overlay [data-message]').textContent.includes('PIN falsch'));assert.equal(depositWrites,0);
 await gate.locator('input[name=pin]').fill('1234');await gate.locator('form button').click();
 await page.locator('dialog.bn-drink-deposit').waitFor({state:'detached'});
 assert.equal(depositWrites,1);assert.equal(savedRule.amountCents,15);assert.equal(savedRule.taxRate,0);
 // Match the owner's basket: 3 x 2.99 plus 3 x .25, separately itemised.
 savedRule.amountCents=25;
 await page.evaluate(()=>manageProductDeposit('p0'));await page.locator('dialog [data-close]').click();await page.locator('dialog').waitFor({state:'detached'});
 await page.addScriptTag({content:app.split('\n').find(line=>line.startsWith('function renderCart()'))});
 await page.evaluate(()=>{window.cart=[{...data.products[0],price:2.99,qty:3}];});
 await page.addScriptTag({url:'/pos/sale-tools.js'});await page.addScriptTag({url:'/pos/numpad.js'});
 await page.waitForFunction(()=>document.querySelector('#total').textContent.includes('9,72'));
 assert.equal(await page.locator('.basket .bn-sale-tools').count(),0);
 assert.equal(await page.locator('#cart .basketline').count(),1);
 assert.equal(await page.locator('[data-deposit-breakdown] .bn-deposit-line').count(),1);
 assert.match(await page.locator('[data-deposit-breakdown]').textContent(),/3 × Pfand/);
 assert.match(await page.locator('[data-deposit-breakdown]').textContent(),/0,75/);
 assert.equal(await page.locator('.bn-cart-hint').textContent(),'');
 await page.addScriptTag({content:app.split('\n').find(line=>line.startsWith('$('+'"moreBtn"'+').onclick='))});
 await page.locator('#moreBtn').click();await page.locator('#retailToolsBtn').click();
 await page.locator('dialog.bn-retail-options').waitFor({state:'visible'});
 assert.equal(await page.locator('dialog.bn-retail-options .bn-sale-tools').count(),2);
 await page.locator('dialog.bn-retail-options>button').click();await page.locator('dialog.bn-retail-options').waitFor({state:'detached'});
 assert.match(await page.locator('#total').textContent(),/9,72/);assert.equal(depositWrites,1);
 console.log('Basket passed: 8.97 merchandise + .75 separately itemised deposit = 9.72, no duplicate charge, sales tools available in More, initial keypad text removed.');
  console.log('Real PIN modal save passed: PIN editable, cancel unlocks save, wrong PIN writes nothing, correct PIN saves exactly once with unlock header.');
  console.log('Real product-menu click opens drink deposit at 1366/820/390 widths.');
 console.log('Actual POS HTML + trade renderer: 1366/820/390 widths, no trade panel overflow, orange primary, duplicate menu absent.');}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

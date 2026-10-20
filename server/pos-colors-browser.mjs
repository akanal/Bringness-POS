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
 console.log('Real product-menu click opens drink deposit at 1366/820/390 widths.');
 console.log('Actual POS HTML + trade renderer: 1366/820/390 widths, no trade panel overflow, orange primary, duplicate menu absent.');}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

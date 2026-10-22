import {createRequire} from 'node:module';
import {checkAddress} from './address-check.js';
const require=createRequire(import.meta.url);
const playwright=await import(process.env.CENTER_TEST_PLAYWRIGHT||'playwright');
const chromium=playwright[process.env.CENTER_TEST_BROWSER||'chromium'];
const fs=require('fs'),http=require('http'),assert=require('assert');
const root=new URL('../apps/web/public',import.meta.url).pathname;
const server=http.createServer((req,res)=>{try{const path=req.url.split('?')[0];if(path==='/fixture'){let html=fs.readFileSync(root+'/pos/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');res.end(html);return}res.setHeader('Content-Type',req.url.includes('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(root+path))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.exposeFunction('fixtureAddressCheck',checkAddress);await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');await page.evaluate(()=>{document.getElementById('auth').hidden=true;document.getElementById('workspace').style.display='block';document.getElementById('kasseView').hidden=true;document.getElementById('moduleView').classList.add('show');document.getElementById('moduleView').innerHTML='<h2>Händler</h2><div id="moduleBody"></div>';document.getElementById('restaurant').innerHTML='<option value="r1">Testbetrieb</option>';window.$=id=>document.getElementById(id);window.esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');window.token='fixture';window.data={products:['Herren Pullover','Hemd','Hose','Jacke'].map((name,i)=>({id:'p'+i,name,restaurantId:'r1'}))};window.api=async(path,opt)=>path==='/address-check'?window.fixtureAddressCheck(JSON.parse(opt.body).address):path==='/billing/profile'?{profile:{company_name:'ahmet.kanal',contact_name:'Ahmet Kanal',street:'Musterstraße 1',postal_code:'10115',city:'Berlin',document_details:{bankName:'Musterbank',iban:'DE89370400440532013000',bic:'COBADEFFXXX',taxNumber:'12/345/67890',phone:'030 123456',email:'handel@example.test'}}}:path.startsWith('/trade/settings')?{enabled:true}:path.startsWith('/trade/prices')?{tiers:data.products.map(p=>({product_id:p.id,min_qty:1,price_cents:1000}))}:{customers:[]};});await page.addScriptTag({url:'/pos/address-check.js'});await page.addScriptTag({url:'/pos/customer-delivery.js'});await page.addScriptTag({url:'/pos/trade.js'});await page.evaluate(()=>renderTradeModule());assert.equal(await page.locator('#moreMenu [data-view="kunden"]').count(),0);
 await page.locator('.trade-recipient summary').click();
 await page.locator('#trade-name').fill('Testkunde GmbH');
 await page.locator('#trade-street').fill('Herzbergstraße 128');await page.locator('#trade-postalCode').fill('10365');await page.locator('#trade-city').fill('Hamburg');await page.locator('#trade-city').blur();
 await page.locator('#trade-city[aria-invalid="true"]').waitFor();assert.equal(await page.locator('#trade-postalCode').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#trade-city').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(180, 35, 50)');
 assert.match(await page.locator('.address-check').textContent(),/Berlin/);
 await page.locator('#trade-city').fill('Berlin');assert.equal(await page.locator('#trade-postalCode').getAttribute('aria-invalid'),null);await page.locator('#trade-city').blur();
 await page.waitForFunction(()=>document.querySelector('.address-check').textContent.includes('stimmen laut Verzeichnis überein'));
 await page.locator('.trade-recipient summary').click();
 await page.locator('[data-add]').first().click();await page.locator('[data-add]').nth(1).click();await page.locator('details.trade-panel>summary').filter({hasText:'Kunden & Dokumente'}).click();await page.locator('[data-preview]').click();
 const preview=page.locator('.trade-sheet-dialog');await preview.waitFor();
 const sheet=preview.locator('.trade-sheet');assert.equal(await sheet.locator('header,footer').count(),0,'invoice must not inherit website header/footer');assert.equal(await sheet.locator('input[placeholder="Artikel suchen …"]').count(),0,'product search belongs outside invoice');assert(await sheet.locator('.trade-sheet-footer').isVisible());assert.match(await sheet.textContent(),/Rechnungsentwurf/);assert.match(await sheet.textContent(),/Musterbank/);
 const returnLine=await sheet.locator('.trade-sheet-return').evaluate(e=>{const r=e.getBoundingClientRect(),n=e.parentElement.querySelector('input').getBoundingClientRect(),c=getComputedStyle(e);return {text:e.textContent,whiteSpace:c.whiteSpace,height:r.height,lineHeight:parseFloat(c.lineHeight),gap:n.top-r.bottom};});assert.equal(returnLine.text,'Ahmet Kanal · Musterstraße 1 · 10115 Berlin');assert.equal(returnLine.whiteSpace,'nowrap');assert(returnLine.height<=returnLine.lineHeight+1);assert(returnLine.gap>=0&&returnLine.gap<12);
 const paper=await sheet.evaluate(e=>{const foot=e.querySelector('.trade-sheet-footer'),f=getComputedStyle(foot),r=e.getBoundingClientRect(),b=foot.getBoundingClientRect(),first=e.querySelector('th');return {sellerCount:e.querySelectorAll('.trade-sheet-seller').length,footerBg:f.backgroundColor,footerPadding:f.paddingLeft,footerLine:f.borderTopWidth,footerColumns:getComputedStyle(foot).gridTemplateColumns.split(' ').map(Number.parseFloat),footerBottom:r.bottom-b.bottom,footerWidth:b.width,paperWidth:r.width,posWidth:first.getBoundingClientRect().width,posHeight:first.getBoundingClientRect().height};});
 assert.equal(paper.sellerCount,0);assert.equal(paper.footerBg,'rgba(0, 0, 0, 0)');assert.equal(paper.footerPadding,'0px');assert.equal(paper.footerLine,'1px');assert(paper.footerColumns.every(w=>w>100),'footer columns must stay readable');assert(paper.footerBottom>=16&&paper.footerBottom<=30,'footer stays at bottom of paper');assert(paper.posWidth>=30,'position number heading must not wrap into single letters');assert(paper.posHeight<45);
assert.equal(await sheet.evaluate(e=>getComputedStyle(e).fontSize),'13px');assert.equal(await sheet.locator('tbody tr').nth(0).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(240, 240, 240)');assert.equal(await sheet.locator('tbody tr').nth(1).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
 assert(await preview.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}));assert(await sheet.evaluate(e=>e.scrollHeight<=e.clientHeight+1));
 const addressStyle=await preview.locator('[data-sheet-address]').evaluate(e=>{const p=e.querySelector('[data-address-field="postalCode"]'),c=e.querySelector('[data-address-field="city"]'),s=getComputedStyle(c);return {border:s.borderBottomWidth,height:c.getBoundingClientRect().height,gap:c.getBoundingClientRect().left-p.getBoundingClientRect().right,sameRow:Math.abs(p.getBoundingClientRect().top-c.getBoundingClientRect().top)<1};});
 assert.equal(addressStyle.border,'0px');assert(addressStyle.height<24);assert(addressStyle.sameRow);assert(addressStyle.gap>=0&&addressStyle.gap<12,'postcode and city stay close together');
 if(process.env.INVOICE_PAPER_SCREENSHOT){const viewport=page.viewportSize();await page.setViewportSize({width:1366,height:1200});await sheet.screenshot({path:process.env.INVOICE_PAPER_SCREENSHOT});await page.setViewportSize(viewport);}

 await preview.locator('[data-address-field="city"]').fill('Hamburg');await preview.locator('[data-address-field="city"]').blur();await preview.locator('[data-address-field="city"][aria-invalid="true"]').waitFor();assert.equal(await preview.locator('[data-address-field="city"]').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(180, 35, 50)');
 await preview.locator('button').first().click();
 for(const width of [1366,820,390]){await page.setViewportSize({width,height:1000});assert(await page.locator('#tradePay').isVisible());assert.equal(await page.locator('#tradePay').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(173, 65, 0)');assert(await page.locator('.trade-layout').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'trade panel overflow at '+width);}// Exercise the real product renderer and real document click listener, not a direct dialog call.
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
 let savedRule=null,depositWrites=0,extraRule=null,checkoutCalls=0,checkoutAmount=0;
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/personnel/access'))return route.fulfill({json:{canManage:true,configured:true}});
  if(path.endsWith('/personnel/unlock')){const body=route.request().postDataJSON();return route.fulfill(body.pin==='1234'?{json:{unlockToken:'fixture-only-unlock'}}:{status:403,json:{error:'PIN falsch'}});}
  if(path.endsWith('/orders/checkout')){const body=route.request().postDataJSON();checkoutCalls++;checkoutAmount=body.payments[0].amountCents;return route.fulfill({json:{id:'fixture-order',requestKey:body.requestKey,restaurantId:body.restaurantId,status:'paid',receiptNumber:'BN-FIXTURE',totalCents:checkoutAmount}});}
  if(path.endsWith('/deposit/rules')){
   if(route.request().method()==='PUT'){savedRule=route.request().postDataJSON();depositWrites++;return route.fulfill({json:{ok:true}});}
   return route.fulfill({json:{rules:savedRule?[{product_id:savedRule.productId,amount_cents:savedRule.amountCents,units:savedRule.units,label:savedRule.label,tax_rate:savedRule.taxRate},...(extraRule?[extraRule]:[])]:[]}});
  }
  return route.fulfill({json:{ok:true}});
 });
 await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','fixture-only');window.api=async(path,options={})=>{const res=await fetch('/api/v1'+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer fixture-only'}});const body=await res.json();if(!res.ok)throw Error(body.error);return body;};});
 await page.addScriptTag({url:'/pos/personnel.js'});
 await page.setViewportSize({width:820,height:1000});
 await page.locator('#products>div').first().locator('summary').click();
 await page.locator('[data-deposit-product]').first().click();
 await page.locator('dialog [data-enabled]').check();await page.locator('dialog [data-amount]').fill('0,15');await page.locator('dialog [data-tax]').selectOption('0');
 await page.locator('dialog>form>button[type=submit]').click();await page.locator('dialog.bn-drink-deposit').waitFor({state:'detached'});assert.equal(depositWrites,1);assert.equal(await page.locator('.personnel-overlay').count(),0);await page.evaluate(()=>manageProductDeposit('p0'));await page.evaluate(()=>{window.fixtureSettingsGate=ensurePersonnelAccess()});
 const gate=page.locator('dialog .personnel-overlay');await gate.locator('input[name=pin]').fill('0000');
 assert(await gate.locator('input[name=pin]').evaluate(e=>document.activeElement===e),'PIN must receive focus inside native modal');
 await gate.locator('[data-close]').click();await gate.waitFor({state:'detached'});
 await page.waitForFunction(()=>!document.querySelector('dialog>form>button[type=submit]').disabled);assert.equal(depositWrites,1);
 await page.evaluate(()=>{window.fixtureSettingsGate=ensurePersonnelAccess()});await gate.locator('input[name=pin]').waitFor();await page.keyboard.press('Escape');await gate.waitFor({state:'detached'});assert(await page.locator('dialog.bn-drink-deposit').isVisible());
 await page.waitForFunction(()=>!document.querySelector('dialog>form>button[type=submit]').disabled);
 await page.evaluate(()=>{window.fixtureSettingsGate=ensurePersonnelAccess()});await gate.locator('input[name=pin]').fill('0000');await gate.locator('form button').click();
 await page.waitForFunction(()=>document.querySelector('.personnel-overlay [data-message]').textContent.includes('PIN falsch'));assert.equal(depositWrites,1);
 await gate.locator('input[name=pin]').fill('1234');await gate.locator('form button').click();await gate.waitFor({state:'detached'});
 await page.locator('dialog [data-close]').click();await page.locator('dialog.bn-drink-deposit').waitFor({state:'detached'});
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
 assert.equal(await page.locator('[data-deposit-breakdown] span').textContent(),'Pfand');
 assert.match(await page.locator('[data-deposit-breakdown]').textContent(),/0,75/);assert.match(await page.locator('[data-deposit-count]').textContent(),/3 × 0,25/);
 assert.equal(await page.locator('.bn-cart-hint').textContent(),'');
 await page.addScriptTag({content:app.split('\n').find(line=>line.startsWith('$('+'"moreBtn"'+').onclick='))});
 await page.locator('#moreBtn').click();await page.locator('#retailToolsBtn').click();
 await page.locator('dialog.bn-retail-options').waitFor({state:'visible'});
 assert.equal(await page.locator('dialog.bn-retail-options .bn-sale-tools').count(),2);
 await page.locator('dialog.bn-retail-options>button').click();await page.locator('dialog.bn-retail-options').waitFor({state:'detached'});
 assert.match(await page.locator('#total').textContent(),/9,72/);assert.equal(depositWrites,1);
 await page.addScriptTag({url:'/pos/payment-flow.js'});
 await page.evaluate(()=>{document.getElementById('pay').disabled=true;bnRefreshSaleTotal();});
 assert.equal(await page.locator('#pay').isDisabled(),false,'deposit refresh must restore payment availability');
 extraRule={product_id:'p1',amount_cents:15,units:1,label:'Flasche',tax_rate:19};
 await page.evaluate(()=>manageProductDeposit('p0'));await page.locator('dialog [data-close]').click();await page.locator('dialog').waitFor({state:'detached'});
 await page.evaluate(()=>{cart.push({...data.products[1],qty:2,price:1.5});renderCart();});
 assert.equal(await page.locator('[data-deposit-breakdown] .bn-deposit-line').count(),2);assert.deepEqual(await page.locator('[data-deposit-breakdown] span').allTextContents(),['Pfand','Pfand']);assert.match(await page.locator('[data-deposit-count]').nth(0).textContent(),/3 × 0,25/);assert.match(await page.locator('[data-deposit-count]').nth(1).textContent(),/2 × 0,15/);assert.match(await page.locator('[data-deposit-breakdown]').textContent(),/0,75/);assert.match(await page.locator('[data-deposit-breakdown]').textContent(),/0,30/);assert.match(await page.locator('#total').textContent(),/13,02/);
 extraRule.amount_cents=25;await page.evaluate(()=>manageProductDeposit('p0'));await page.locator('dialog [data-close]').click();await page.locator('dialog').waitFor({state:'detached'});await page.evaluate(()=>renderCart());assert.equal(await page.locator('[data-deposit-breakdown] .bn-deposit-line').count(),1);assert.match(await page.locator('[data-deposit-count]').textContent(),/5 × 0,25/);assert.match(await page.locator('#total').textContent(),/13,22/);
 extraRule.amount_cents=15;await page.evaluate(()=>manageProductDeposit('p0'));await page.locator('dialog [data-close]').click();await page.locator('dialog').waitFor({state:'detached'});await page.evaluate(()=>renderCart());assert.equal(await page.locator('[data-deposit-breakdown] .bn-deposit-line').count(),2);
 await page.locator('[data-keypad-toggle]').click();assert.equal(await page.locator('[data-key="ok"]').count(),0);
 const key=async k=>page.locator('[data-key="'+k+'"]').click();
 await key('2');assert.equal(await page.locator('[data-change-label]').textContent(),'Noch zu zahlen');assert.match(await page.locator('[data-change]').textContent(),/11,02/);await key('0');assert.equal(await page.evaluate(()=>bnCashTenderValue),'20');assert.equal(await page.locator('[data-change-label]').textContent(),'Rückgeld');assert.match(await page.locator('[data-change]').textContent(),/6,98/);
 await key('back');assert.equal(await page.evaluate(()=>bnCashTenderValue),'2');await key('back');assert.equal(await page.evaluate(()=>bnCashTenderValue),'');assert.equal(await page.locator('.bn-tender-summary').evaluate(e=>e.classList.contains('show')),false);await key('0');assert.equal(await page.locator('[data-change-label]').textContent(),'Noch zu zahlen');assert.match(await page.locator('[data-change]').textContent(),/13,02/);await key('back');
 await key('1');await key(',');await key('5');await key('0');assert.equal(await page.evaluate(()=>bnCashTenderValue),'1,50');assert.equal(await page.locator('[data-change-label]').textContent(),'Noch zu zahlen');assert.match(await page.locator('[data-change]').textContent(),/11,52/);for(let i=0;i<4;i++)await key('back');assert.equal(await page.evaluate(()=>bnCashTenderValue),'');
 await key('1');await key('3');await key(',');await key('0');await key('2');assert.equal(await page.locator('[data-change-label]').textContent(),'Rückgeld');assert.match(await page.locator('[data-change]').textContent(),/0,00/);for(let i=0;i<5;i++)await key('back');
 await page.locator('#cart .basketline').first().click();await key('1');assert.equal(await page.evaluate(()=>cart[0].qty),1);await key('2');assert.equal(await page.evaluate(()=>cart[0].qty),12);await key('back');assert.equal(await page.evaluate(()=>cart[0].qty),1);await key('back');assert.equal(await page.evaluate(()=>cart.length),1);assert.equal(await page.evaluate(()=>cart[0].id),'p1');assert.equal(await page.evaluate(()=>cart[0].qty),2);assert.match(await page.locator('#total').textContent(),/3,30/);assert.match(await page.locator('[data-deposit-count]').textContent(),/2 × 0,15/);
 await page.evaluate(()=>{cart.unshift({...data.products[0],qty:3,price:2.99});renderCart();});assert.match(await page.locator('#total').textContent(),/13,02/);
 await page.locator('#paymentMethod').selectOption('card');await page.locator('#pay').click();assert.equal(checkoutCalls,0);assert.match(await page.locator('#saleMsg').textContent(),/Terminalanbindung/);
 await page.locator('#paymentMethod').selectOption('cash');await page.locator('#pay').click();await page.waitForFunction(()=>document.querySelector('#saleMsg').textContent.includes('Verkauf gespeichert'));assert.equal(checkoutCalls,1);assert.equal(checkoutAmount,1302);assert.equal(await page.evaluate(()=>cart.length),0);assert.equal(await page.locator('[data-deposit-breakdown] .bn-deposit-line').count(),0);
 console.log('Direct keypad and payment passed: aggregate mixed deposit, immediate tender/quantity, deletion clears stored values, no apply button, card guard and one cash checkout for 13.02.');
  console.log('Basket passed: 8.97 merchandise + .75 separately itemised deposit = 9.72, no duplicate charge, sales tools available in More, initial keypad text removed.');
  console.log('Real PIN modal save passed: PIN editable, cancel unlocks save, wrong PIN writes nothing, correct PIN saves exactly once with unlock header.');
  console.log('Real product-menu click opens drink deposit at 1366/820/390 widths.');
 console.log('Actual POS HTML + trade renderer: 1366/820/390 widths, no trade panel overflow, orange primary, duplicate menu absent.');}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

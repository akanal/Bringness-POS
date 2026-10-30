// Optional real Chromium acceptance; dependencies supplied by the local runner.
// Serves only catalog files on an ephemeral loopback port in this process.
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {shopPreview} from '../../server/shop-preview-policy.js';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH));
const root=fileURLToPath(new URL('../../apps/web/public/shop/',import.meta.url));
const artifacts=process.env.SHOP_BROWSER_ARTIFACTS;
// Synthetic account data for read-only browser status acceptance, never production.
const accountQuote=shopPreview({cart:{'pos-online':1},plans:[{code:'pos_base_monthly',amount_cents:2999,billing_type:'monthly',currency:'EUR',active:true}],profile:{company_name:'Browser Fixture',street:'Example 1',postal_code:'10115',city:'Berlin',country:'DE'}});
const accountDraft={version:1,id:crypto.randomUUID(),requestId:crypto.randomUUID(),status:'draft',expired:false,createdAt:accountQuote.checkedAt,expiresAt:accountQuote.expiresAt,snapshot:accountQuote,canPay:false,canActivate:false,checkoutConnected:false};
const accountOrder={version:1,id:crypto.randomUUID(),requestId:crypto.randomUUID(),draftId:accountDraft.id,status:'prepared',snapshot:{...accountQuote.lines[0],currency:'EUR'},canPay:false,canActivate:false,checkoutConnected:false};
const canceledDraft={...accountDraft,id:crypto.randomUUID(),requestId:crypto.randomUUID(),status:'canceled'};
const historyItem=d=>({id:d.id,status:d.status,expired:d.expired,createdAt:d.createdAt,expiresAt:d.expiresAt,...Object.fromEntries(['productId','planCode','period','netCents','vatCents','grossCents'].map(k=>[k,d.snapshot.lines[0][k]])),currency:'EUR'});
const historyPage=second=>({version:1,scope:'a'.repeat(64),items:[historyItem(second?canceledDraft:accountDraft)],nextCursor:second?null:'cGFnZTI',canPay:false,canActivate:false,checkoutConnected:false});
const accountReads=[];
const server=http.createServer(async(req,res)=>{
 try{const u=new URL(req.url,'http://local');if(u.pathname.startsWith('/api/v1/shop/')){accountReads.push({path:u.pathname,method:req.method});if(req.method!=='GET'||req.headers.authorization!=='Bearer browser-fixture'){res.writeHead(403);res.end();return;}const payload=u.pathname==='/api/v1/shop/drafts/history'?historyPage(u.searchParams.has('cursor')):u.pathname===`/api/v1/shop/drafts/${canceledDraft.id}`?canceledDraft:u.pathname==='/api/v1/shop/drafts/active'?accountDraft:u.pathname===`/api/v1/shop/checkouts/drafts/${accountDraft.id}`?accountOrder:null;if(!payload){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(payload));return;}const file=path.resolve(root,'.'+decodeURIComponent(u.pathname.replace(/^\/shop/,'')));const target=u.pathname==='/shop/'?path.join(root,'index.html'):file;
 if(!target.startsWith(root)||!['.html','.css','.js'].includes(path.extname(target))){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(target)],'cache-control':'no-store'});res.end(await readFile(target));
 }catch{res.writeHead(404);res.end();}
});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({...(process.env.SHOP_CHROMIUM_PATH?{executablePath:process.env.SHOP_CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 if(artifacts)await mkdir(artifacts,{recursive:true});
 const context=await browser.newContext(),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/shop/');await page.evaluate(()=>sessionStorage.clear());await page.reload();
  await page.locator('.card').first().waitFor();assert.equal(await page.locator('.card').count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`catalog overflow at ${width}`);
  const assistantArrow=page.getByRole('link',{name:'Bringness-Assistent öffnen',exact:true});
  assert.equal(await assistantArrow.count(),1,'single assistant entry');
  assert.equal(await page.locator('.assistant-entry').count(),0,'floating entry removed');
  assert.equal(await assistantArrow.getAttribute('href'),'/shop/assistant.html#buy');
  const arrowBox=await assistantArrow.boundingBox();assert.ok(arrowBox.width>=44&&arrowBox.height>=44,'accessible touch target');
  await assistantArrow.focus();assert.equal(await assistantArrow.evaluate(el=>el===document.activeElement),true,'arrow keyboard focus');
  assert.equal(await page.getByRole('link',{name:'Bringness Startseite',exact:true}).getAttribute('href'),'/shop/');
  if(artifacts)await page.screenshot({path:path.join(artifacts,`catalog-${width}.png`),fullPage:true});
  await page.locator('.card-actions button').first().click();await page.locator('#detail-dialog[open]').waitFor();
  assert.equal(await page.locator('#detail-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false,`detail overflow at ${width}`);
  await page.getByRole('button',{name:'Auf Merkliste',exact:true}).click();
  await page.getByRole('button',{name:'Von Merkliste entfernen',exact:true}).waitFor();
  if(artifacts)await page.screenshot({path:path.join(artifacts,`detail-${width}.png`)});
  await page.locator('.product-permalink').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY','FAQ keyboard reachability');await page.keyboard.press('Enter');assert.equal(await page.locator('.product-questions details').first().getAttribute('open')!==null,true);
  await page.keyboard.press('Escape');await page.locator('#detail-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.dataset.action==='details');assert.equal(await page.locator('.card-actions button').first().evaluate(e=>e===document.activeElement),true,'detail focus return');
  if(width<=768){await page.locator('#filter-toggle').click();assert.equal(await page.locator('#filter-panel').isVisible(),false);await page.locator('#filter-toggle').click();}
 }
 await page.locator('[data-action="compare"]').first().click();await page.reload();assert.equal(await page.locator('#compare-count').textContent(),'1');await page.locator('#compare-open').click();
 await page.evaluate(()=>{window.print=()=>{};});await page.locator('#compare-print').click();await page.emulateMedia({media:'print'});assert.equal(await page.locator('main').evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await page.locator('#compare-dialog').evaluate(e=>getComputedStyle(e).display),'block');
 if(artifacts)await page.screenshot({path:path.join(artifacts,'comparison-print.png'),fullPage:true});
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await page.emulateMedia({media:'screen'});await page.locator('#compare-dialog [data-close]').click();
 await page.setViewportSize({width:390,height:900});
 await page.locator('.card-actions button').filter({hasText:'In den Warenkorb'}).first().click();await page.locator('#cart-open').click();
 await page.locator('[data-cart-action="plus"]').click();assert.equal(await page.locator('#cart-count').textContent(),'2');await page.locator('[data-cart-action="minus"]').click();assert.equal(await page.locator('#cart-count').textContent(),'1');
 await page.locator('[data-cart-action="quantity"]').fill('1.5');await page.locator('[data-cart-action="quantity"]').press('Tab');assert.equal(await page.locator('#review-open').isDisabled(),true);assert.equal(await page.locator('#cart-count').textContent(),'1');
 await page.locator('[data-cart-action="quantity"]').fill('1');await page.locator('[data-cart-action="quantity"]').press('Tab');assert.equal(await page.locator('#review-open').isDisabled(),false);
 await page.locator('#cart-content [data-cart-action="details"]').click();await page.locator('#detail-dialog[open]').waitFor();assert.equal(await page.locator('#cart-dialog').evaluate(e=>e.open),true);await page.locator('#detail-dialog [data-close]').click();await page.waitForFunction(()=>document.activeElement?.dataset.cartAction==='details');
 if(artifacts)await page.screenshot({path:path.join(artifacts,'cart-controls-390.png')});
 await page.getByRole('button',{name:'Für später merken',exact:true}).click();assert.equal(await page.locator('#cart-count').textContent(),'0');
 await page.getByRole('button',{name:'Entfernen rückgängig',exact:true}).click();assert.equal(await page.locator('#cart-count').textContent(),'1');
 assert.equal(await page.locator('#cart-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false,'cart overflow');
 await page.locator('#review-open').click();await page.locator('#review-dialog[open]').waitFor();assert.equal(await page.locator('#review-dialog button:disabled').count()>0,true);
 await page.locator('#review-dialog [data-close]').click();
 await page.setViewportSize({width:320,height:900});await page.locator('#shop-account-open').click();await page.locator('#shop-account-dialog[open]').waitFor();
 assert.equal(await page.locator('#shop-account-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false,'customer hub overflow');
 if(artifacts)await page.screenshot({path:path.join(artifacts,'customer-hub-320.png')});
 await page.locator('#hub-drafts').click();await page.waitForFunction(()=>document.getElementById('account-status').textContent.includes('Bitte zuerst'));await page.waitForFunction(()=>document.getElementById('review-dialog').getAttribute('aria-busy')==='false');
 await page.locator('#review-dialog [data-close]').click();await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','browser-fixture');sessionStorage.removeItem('bringness.shop.draft.v2');});
 await page.locator('#shop-account-open').click();await page.locator('#hub-drafts').click();await page.locator('#checkout-refresh').waitFor();
 await page.waitForFunction(()=>document.getElementById('review-dialog').getAttribute('aria-busy')==='false');
 await page.locator('#checkout-refresh').click();await page.getByRole('heading',{name:'Vorbereitung gespeichert',exact:true}).waitFor();
 await page.waitForFunction(()=>document.getElementById('review-dialog').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#checkout-prepare').isDisabled(),true);
 await page.getByRole('button',{name:'Vorbereitung verwerfen',exact:true}).click();await page.getByRole('button',{name:'Behalten',exact:true}).click();assert.equal(await page.locator('.checkout-confirmation').isVisible(),false);
 if(artifacts)await page.screenshot({path:path.join(artifacts,'checkout-prepared-320.png')});
 accountOrder.status='uncertain';await page.locator('#checkout-refresh').click();await page.getByRole('heading',{name:'Unklarer Zahlungsstatus',exact:true}).waitFor();await page.waitForFunction(()=>document.getElementById('review-dialog').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#checkout-prepare').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Vorbereitung verwerfen',exact:true}).count(),0);assert.equal(await page.locator('#review-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 const statusBox=await page.getByRole('heading',{name:'Unklarer Zahlungsstatus',exact:true}).boundingBox();assert.ok(statusBox.y>=0&&statusBox.y+statusBox.height<=900,'recovered status is in view');
 assert.equal(await page.getByRole('heading',{name:'Unklarer Zahlungsstatus',exact:true}).getAttribute('data-tone'),'warning');
 if(artifacts)await page.screenshot({path:path.join(artifacts,'checkout-uncertain-320.png')});
 await page.locator('#review-dialog [data-close]').click();await page.locator('#shop-account-open').click();await page.locator('#hub-history').click();await page.locator('.history-entry').first().waitFor();
 await page.getByRole('button',{name:'Weitere Entwürfe laden',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===2);assert.equal(await page.locator('#history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 assert.equal(await page.locator('#history-dialog [data-close]').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true,'history close is visible and not occluded');const historyClose=await page.locator('#history-dialog [data-close]').boundingBox();assert.ok(historyClose&&historyClose.y>=0&&historyClose.y+historyClose.height<=900,'history close button remains in view: '+JSON.stringify(historyClose));
 if(artifacts)await page.screenshot({path:path.join(artifacts,'draft-history-320.png')});
 const cartBefore=await page.locator('#cart-count').textContent();await page.locator('.history-entry button').nth(1).click();await page.getByRole('heading',{name:'Entwurf verworfen',exact:true}).waitFor();assert.equal(await page.locator('#cart-count').textContent(),cartBefore);assert.equal(await page.locator('#checkout-prepare').count(),0);
 assert.equal(await page.getByRole('heading',{name:'Entwurf verworfen',exact:true}).getAttribute('data-tone'),'neutral');
 assert.equal(accountReads.length,6);assert.ok(accountReads.every(r=>r.method==='GET'));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);

 console.log('Chromium passed: 1440/768/390/320px catalog and details, focus return, mobile filters, saved-for-later undo, payment gate, no runtime errors or external requests.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

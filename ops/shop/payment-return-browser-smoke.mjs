import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {downloadFixture} from './download-fixture.mjs';
import {createShopRuntime} from '../../server/shop-http.js';
import {shopPaymentReturnUrl} from '../../server/shop-payment-return-url.js';
import {saveShopDraft} from '../../server/shop-drafts.js';
import {prepareShopCheckout} from '../../server/shop-checkout-orders.js';
const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH)),f=await downloadFixture({accept:false,paid:false}),site='https://fixture.example.test',runtime=createShopRuntime(f.pool,{enabled:true});await runtime.migrate();
await f.db.query("INSERT INTO company_billing_terms VALUES($1,'pos_base_monthly',2999)",[f.b]);const draft=await saveShopDraft(f.pool,{token:'owner-b',requestId:crypto.randomUUID(),cart:{'pos-online':1}}),line=draft.snapshot.lines[0],monthly=await prepareShopCheckout(f.pool,{token:'owner-b',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:line.netCents,acceptedGrossCents:line.grossCents});
const root=fileURLToPath(new URL('../../apps/web/public/shop/',import.meta.url)),requests=[];let available=true;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname.startsWith('/api/')){requests.push({url:req.url,method:req.method});if(!available){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'SHOP_UNAVAILABLE'}));return;}if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}return;}
 if(u.pathname==='/shop/')u.pathname='/shop/index.html';if(!/^\/shop\/[a-z0-9-]+\.(?:html|js|css)$/.test(u.pathname)){res.writeHead(404);res.end();return;}
 try{const bytes=await readFile(path.join(root,u.pathname.slice(6)));res.writeHead(200,{'Content-Type':u.pathname.endsWith('.js')?'text/javascript; charset=utf-8':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({executablePath:process.env.SHOP_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext(),page=await context.newPage(),errors=[],external=[],csp=[];
 await context.addInitScript(()=>{if(!localStorage.getItem('bringness-pos-token'))localStorage.setItem('bringness-pos-token','owner-a');});await page.exposeFunction('reportCsp',v=>csp.push(v));await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.reportCsp(e.violatedDirective)));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==site){external.push(req.url());await route.abort();return;}const res=await fetch(local+url.pathname+url.search,{method:req.method(),headers:req.headers(),...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});});
 const dir=process.env.SHOP_BROWSER_ARTIFACTS;if(dir)await mkdir(dir,{recursive:true});const check=()=>page.getByRole('button',{name:'Gespeicherten Status prüfen',exact:true}).click();
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});const count=requests.length;await page.goto(shopPaymentReturnUrl(site,f.order.id));await page.getByRole('button',{name:'Gespeicherten Status prüfen',exact:true}).waitFor();assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).hash,'#checkout='+f.order.id);assert.equal(requests.length,count);
  await check();await page.locator('[data-shop-status="prepared"]').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`return overflow ${width}`);if(dir)await page.screenshot({path:path.join(dir,`payment-return-${width}.png`),fullPage:true});
 }
 await f.consent();await f.progress();const receiptsBefore=(await f.db.query('SELECT * FROM shop_download_invoice_consents')).rows;await check();await page.locator('[data-shop-status="paid"]').waitFor();assert.match(await page.locator('.payment-return').textContent(),/Lizenz weiterhin gesperrt/);assert.equal(await page.locator('[data-shop-status="completed"]').count(),0);
 const noForgery=requests.length;await page.goto(shopPaymentReturnUrl(site,f.order.id)+'&status=paid&token=ignored');await page.getByText(/Keine eindeutige Vorgangsnummer/).waitFor();assert.equal(requests.length,noForgery);assert.equal(await page.locator('[data-shop-status="paid"]').count(),0);assert.equal(new URL(page.url()).search,'');
 await page.goto(site+'/shop/');await page.getByRole('button',{name:'In den Warenkorb',exact:true}).first().click();assert.equal(await page.locator('#cart-count').textContent(),'1');const before=requests.length;await page.goto(site+'/shop/?checkout=return&order='+f.order.id);await page.getByRole('link',{name:'Gespeicherten Rückkehrstatus prüfen',exact:true}).waitFor();assert.equal(new URL(page.url()).search,'');assert.equal(requests.length,before);assert.equal(await page.locator('#cart-count').textContent(),'1');await page.getByRole('link',{name:'Gespeicherten Rückkehrstatus prüfen',exact:true}).click();await check();await page.locator('[data-shop-status="paid"]').waitFor();
 await context.setOffline(true);await page.getByText(/Offline. Die Statusanzeige wurde entfernt/).waitFor();const offlineCount=requests.length;await context.setOffline(false);await page.getByText(/Wieder verbunden/).waitFor();assert.equal(requests.length,offlineCount);assert.equal(await page.locator('input[aria-label="Vorgangsnummer"]').count(),0);
 await check();await page.locator('[data-shop-status="paid"]').waitFor();await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','owner-b');window.dispatchEvent(new StorageEvent('storage',{key:'bringness-pos-token'}));});await page.getByText(/Das Konto hat gewechselt/).waitFor();assert.equal(await page.locator('input[aria-label="Vorgangsnummer"]').count(),0);await check();await page.getByText(/Für dieses Konto wurde kein passender Vorgang gefunden/).waitFor();
 await page.goto(shopPaymentReturnUrl(site,monthly.id));await check();await page.locator('[data-shop-status="prepared"]').waitFor();const text=await page.locator('.payment-return').textContent();assert.ok(text.includes('29,99')&&text.includes('35,69'));assert.equal(text.includes('34,99'),false);assert.equal(await page.locator('.payment-return a[href*="download-review.html"]').count(),0);
 available=false;await check();await page.getByText(/erneute Prüfung ist ausgeblieben/).waitFor();assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(csp,[]);
 for(const table of ['billing_transactions','company_entitlements'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);assert.deepEqual((await f.db.query('SELECT * FROM shop_download_invoice_consents')).rows,receiptsBefore);
 console.log('Payment return Chromium passed: 4 widths, query-to-fragment cleanup, idle explicit GET, prepared/paid-blocked states, forged-query rejection, legacy recovery preserving cart, offline/account privacy, monthly special price and unavailable retry; no POST, grants, billing writes, overflow, external requests or CSP/page errors.');await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));await f.db.close();}

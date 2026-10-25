import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {historyFixture} from './download-history-fixture.mjs';
import {seller} from './download-fixture.mjs';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH)),f=await historyFixture(),site='https://fixture.example.test',runtime=createShopDownloadRuntime(f.pool,{enabled:true,seller,publicOrigin:site});await runtime.migrate();
const root=fileURLToPath(new URL('../../apps/web/public/shop/',import.meta.url)),requests=[];let available=true;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://local');if(url.pathname.startsWith('/api/')){requests.push({url:req.url,method:req.method});if(!available){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'SHOP_UNAVAILABLE'}));return;}if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}return;}
 if(url.pathname==='/shop/')url.pathname='/shop/index.html';if(!/^\/shop\/[a-z0-9-]+\.(html|js|css)$/.test(url.pathname)){res.writeHead(404);res.end();return;}
 try{const body=await readFile(path.join(root,url.pathname.slice(6)));res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({executablePath:process.env.SHOP_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext(),page=await context.newPage(),errors=[],external=[],csp=[];
 await context.addInitScript(()=>localStorage.setItem('bringness-pos-token','owner-a'));await page.exposeFunction('reportCsp',v=>csp.push(v));await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.reportCsp(e.violatedDirective)));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==site){external.push(req.url());await route.abort();return;}const res=await fetch(local+url.pathname+url.search,{method:req.method(),headers:req.headers(),...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});});
 const dir=process.env.SHOP_BROWSER_ARTIFACTS;if(dir)await mkdir(dir,{recursive:true});const url=site+'/shop/download-history.html',reload=()=>page.getByRole('button',{name:'Verlauf neu laden',exact:true}).click();
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});const before=requests.length;await page.goto(url);await page.getByRole('button',{name:'Verlauf neu laden',exact:true}).waitFor();assert.equal(requests.length,before);
  await reload();await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===10);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);assert.ok((await page.locator('.history-entry').first().textContent()).includes('474,81'));
  if(dir)await page.screenshot({path:path.join(dir,`download-history-${width}.png`),fullPage:true});
 }
 await page.getByRole('button',{name:'Weitere Vorgänge laden',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===20);await page.getByRole('button',{name:'Weitere Vorgänge laden',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===24);
 assert.equal(new Set(await page.locator('.history-entry a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))).size,24);assert.equal(await page.getByRole('button',{name:'Weitere Vorgänge laden',exact:true}).isVisible(),false);
 await page.getByRole('combobox',{name:'Kaufstatus filtern'}).selectOption('paid');await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===4);assert.equal(await page.locator('.history-entry [data-shop-status="paid"]').count(),4);assert.equal(await page.locator('[data-shop-status="completed"]').count(),0);
 await page.getByRole('combobox',{name:'Kaufstatus filtern'}).selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===10);await page.locator(`a[href="/shop/download-review.html#checkout=${f.order.id}"]`).click();await page.getByRole('button',{name:'Rechnungsdaten laden',exact:true}).click();await page.getByText('Rechnungsdaten geladen. Bitte vollständig prüfen und ausdrücklich zustimmen.',{exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);
 await page.getByRole('navigation',{name:'Zurück zum Shop'}).getByRole('link',{name:'Windows-Kaufverlauf',exact:true}).click();await reload();await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===10);
 await context.setOffline(true);await page.getByText(/Offline. Die angezeigten Vorgänge wurden entfernt/).waitFor();const offlineCount=requests.length;await context.setOffline(false);await page.getByText(/Wieder verbunden/).waitFor();assert.equal(requests.length,offlineCount);assert.equal(await page.locator('.history-entry').count(),0);
 await reload();await page.waitForFunction(()=>document.querySelectorAll('.history-entry').length===10);await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','owner-b');window.dispatchEvent(new StorageEvent('storage',{key:'bringness-pos-token'}));});await page.getByText(/Das Konto hat gewechselt/).waitFor();assert.equal(await page.locator('.history-entry').count(),0);await reload();await page.getByText('Keine gespeicherten Windows-Vorgänge für diesen Filter.',{exact:true}).waitFor();
 available=false;await reload();await page.getByText(/Der Kaufverlauf ist derzeit nicht verfügbar/).waitFor();const before=requests.length;await page.goto(url+'?token=ignored');await page.getByText(/URL-Zusätze werden nicht verwendet/).waitFor();assert.equal(requests.length,before);
 assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(csp,[]);for(const table of ['billing_transactions','company_entitlements','shop_download_invoice_consents'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
 console.log('Download history Chromium passed: 4 widths, 24 paginated records, paid filter, review deep link/back navigation, offline recovery without auto-fetch, company clearing/empty state, unavailable backend and invalid URL; GET-only, no business writes, overflow, external requests or CSP/page errors.');await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));await f.db.close();}

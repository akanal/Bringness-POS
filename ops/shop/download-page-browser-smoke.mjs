import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {downloadFixture,seller} from './download-fixture.mjs';
import {pdfRenderer} from './download-pdf-fixture.mjs';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH)),f=await downloadFixture({accept:false,paid:false}),publicOrigin='https://fixture.example.test';
const issuer={...seller,name:'Synthetischer Anbieter <img src=x onerror=alert(1)>'},runtime=createShopDownloadRuntime(f.pool,{enabled:true,seller:issuer,publicOrigin,pdfRenderer});await runtime.migrate();
const root=fileURLToPath(new URL('../../apps/web/public/shop/',import.meta.url)),requests=[];let available=true;
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){requests.push({path:req.url,method:req.method});if(!available){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'SHOP_UNAVAILABLE'}));return;}if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}return;}
 if(!/^\/shop\/[a-z0-9-]+\.(?:html|js|css)$/.test(req.url)){res.writeHead(404);res.end();return;}
 try{const body=await readFile(path.join(root,req.url.slice(6)));res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'text/javascript; charset=utf-8':req.url.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({executablePath:process.env.SHOP_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext(),page=await context.newPage(),errors=[],external=[],csp=[];let drop=true;
 await context.addInitScript(()=>{localStorage.setItem('bringness-pos-token','owner-a');window.print=()=>window.printCount=(window.printCount||0)+1;});
 await page.exposeFunction('reportCsp',value=>csp.push(value));await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.reportCsp(e.violatedDirective)));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==publicOrigin){external.push(req.url());await route.abort();return;}
  const response=await fetch(local+url.pathname+url.search,{method:req.method(),headers:req.headers(),...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})}),body=Buffer.from(await response.arrayBuffer());
  if(req.method()==='POST'&&drop){drop=false;await route.abort('failed');return;}await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
 });
 const artifacts=process.env.SHOP_BROWSER_ARTIFACTS;if(artifacts)await mkdir(artifacts,{recursive:true});
 const url=publicOrigin+'/shop/download-review.html#checkout='+f.order.id,load=()=>page.getByRole('button',{name:'Rechnungsdaten laden',exact:true}).click();
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(url);await page.getByRole('button',{name:'Kaufstatus prüfen',exact:true}).waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await load();await page.getByText('Rechnungsdaten geladen. Bitte vollständig prüfen und ausdrücklich zustimmen.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.equal(await page.getByRole('button',{name:'Rechnungsformat bestätigen',exact:true}).isDisabled(),true);assert.equal(await page.locator('img,iframe').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
  assert.ok((await page.locator('.download-review').textContent()).includes('474,81'));if(artifacts)await page.screenshot({path:path.join(artifacts,`download-review-${width}.png`),fullPage:true});
 }
 const long='W'.repeat(500);await f.db.query("UPDATE company_billing_profiles SET company_name=$1 WHERE company_id=$2",[long,f.a]);await f.db.query("UPDATE shop_checkout_orders SET billing_snapshot=jsonb_set(billing_snapshot,'{company_name}',$1::jsonb)",[JSON.stringify(long)]);
 await load();await page.getByText(long,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'long name overflow');
 await f.db.query("UPDATE company_billing_profiles SET company_name='Fixture Company' WHERE company_id=$1",[f.a]);await f.db.exec("UPDATE shop_checkout_orders SET billing_snapshot=jsonb_set(billing_snapshot,'{company_name}','\"Fixture Company\"')");
 await load();await page.getByText('Fixture Company',{exact:true}).waitFor();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Rechnungsformat bestätigen',exact:true}).click();await page.getByText(/Die Antwort ist unklar/).waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,1);
 await page.getByRole('button',{name:'Gespeicherten Nachweis prüfen',exact:true}).click();await page.getByRole('heading',{name:'Gespeicherte Zustimmung',exact:true}).waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,1);
 await f.progress();await page.getByRole('button',{name:'Kaufstatus prüfen',exact:true}).click();await page.getByText('TEST-Vorgang · keine gültige Lizenz',{exact:true}).waitFor();assert.equal(await page.locator('[data-shop-status="completed"]').count(),0);
 await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();await page.getByRole('button',{name:'Kaufstatus prüfen',exact:true}).click();await page.getByRole('button',{name:'Rechnungsvorschau laden',exact:true}).click();await page.getByRole('heading',{name:'Rechnungsvorschau',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'PDF preview overflow at 320');if(artifacts)await page.screenshot({path:path.join(artifacts,'download-pdf-preview-320.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Vorschau als PDF herunterladen',exact:true}).click();const downloaded=await downloadPromise;assert.match(downloaded.suggestedFilename(),/^Bringness-Vorschau-BN-2026-\d{6}\.pdf$/);const pdfBytes=await readFile(await downloaded.path());assert.equal(pdfBytes.subarray(0,8).toString(),'%PDF-1.7');const stored=(await f.db.query('SELECT snapshot FROM shop_download_fulfilments')).rows[0].snapshot;assert.ok(pdfBytes.equals(await pdfRenderer(stored,{publicOrigin})),'downloaded PDF differs from the original-data preview with invoice QR');if(artifacts)await downloaded.saveAs(path.join(artifacts,'browser-preview.pdf'));await page.getByText(/PDF-Vorschau bereitgestellt/).waitFor();
 assert.equal(await page.evaluate(()=>window.printCount||0),0);await page.getByRole('button',{name:'Vorschau drucken',exact:true}).click();assert.equal(await page.evaluate(()=>window.printCount),1);
 await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});assert.equal(await page.locator('.download-invoice .shop-status').isVisible(),true);assert.equal(await page.getByRole('button',{name:'Kaufstatus prüfen',exact:true}).isVisible(),false);if(artifacts)await page.screenshot({path:path.join(artifacts,'download-review-print.png'),fullPage:true});await page.emulateMedia({media:'screen'});
 await page.evaluate(()=>{localStorage.setItem('bringness-pos-token','owner-b');window.dispatchEvent(new StorageEvent('storage',{key:'bringness-pos-token'}));});await page.getByText(/Das Konto hat gewechselt/).waitFor();assert.equal((await page.locator('.download-review').textContent()).includes('Fixture Company'),false);
 available=false;await page.getByRole('button',{name:'Kaufstatus prüfen',exact:true}).click();await page.getByText(/Die Prüfung ist derzeit nicht verfügbar/).waitFor();assert.equal(await page.locator('input[type=checkbox]').isChecked(),false);
 const before=requests.length;await page.goto(publicOrigin+'/shop/download-review.html#checkout=bad');await page.getByText(/Keine gültige Vorgangsnummer/).waitFor();assert.equal(requests.length,before);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(csp,[]);assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,1);
 console.log('Download review page Chromium passed: 4 widths, long/hostile text, explicit consent, one-POST lost-reply recovery, paid/blocked status, original-data HTML/PDF preview, explicit download/print, account clearing, unavailable backend and invalid URL; no overflow, CSP/page errors or external requests.');await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));await f.db.close();}

// Optional isolated browser/HTTP integration. The HTTPS fixture origin is
// intercepted and forwarded only to the loopback harness; never deployed.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {downloadFixture,seller} from './download-fixture.mjs';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH));
const f=await downloadFixture({accept:false,paid:false}),publicOrigin='https://fixture.example.test',runtime=createShopDownloadRuntime(f.pool,{enabled:true,seller,publicOrigin});await runtime.migrate();
const clientSource=await readFile(new URL('../../apps/web/public/shop/download-review-client.js',import.meta.url),'utf8');
const pageHtml=`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Isolierter Ablauf-Test</title></head><body><h1>Synthetischer Ablauf-Test</h1><button id="load">Daten prüfen</button><pre id="details"></pre><label><input id="agree" type="checkbox">PDF ausdrücklich zustimmen</label><button id="save" disabled>Zustimmung speichern</button><button id="receipt">Nachweis prüfen</button><p id="result" role="status"></p><script type="module">
import {createDownloadReviewClient} from '/shop/download-review-client.js';
window.client=createDownloadReviewClient({getToken:()=>window.fixtureToken});window.fixtureToken='owner-a';const id='${f.order.id}';let view;
const load=document.querySelector('#load'),agree=document.querySelector('#agree'),save=document.querySelector('#save'),result=document.querySelector('#result');
load.onclick=async()=>{view=await client.readConsent(id);document.querySelector('#details').textContent=view.text;agree.checked=false;save.disabled=true;result.textContent='Daten geladen';};agree.onchange=()=>save.disabled=!agree.checked;
save.onclick=async()=>{save.disabled=true;try{await client.acceptConsent(view,{accepted:agree.checked});result.textContent='Gespeichert';}catch(e){result.textContent=e.code;}};
document.querySelector('#receipt').onclick=async()=>{const r=await client.readReceipt(id);result.textContent=r.recorded?'Nachweis gespeichert':'Kein Nachweis';};
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/review-test/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(pageHtml);return;}
 if(req.url==='/shop/download-review-client.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(clientSource);return;}
 if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const localOrigin=`http://127.0.0.1:${server.address().port}`;
let browser;try{
 browser=await chromium.launch({executablePath:process.env.SHOP_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[],external=[],requests=[];let drop=true;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==publicOrigin){external.push(req.url());await route.abort();return;}
  requests.push({path:url.pathname,method:req.method()});
  const response=await fetch(localOrigin+url.pathname+url.search,{method:req.method(),headers:req.headers(),...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});
  const body=Buffer.from(await response.arrayBuffer());
  if(req.method()==='POST'&&drop){drop=false;await route.abort('failed');return;}
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
 });
 await page.goto(publicOrigin+'/review-test/');await page.locator('#load').click();await page.getByText('Daten geladen',{exact:true}).waitFor();
 assert.equal(await page.locator('#agree').isChecked(),false);assert.equal(await page.locator('#save').isDisabled(),true);assert.equal(requests.filter(r=>r.method==='POST').length,0);
 await page.locator('#agree').check();await page.locator('#save').click();await page.getByText('REQUEST_UNCERTAIN',{exact:true}).waitFor();
 assert.equal(requests.filter(r=>r.method==='POST').length,1);await page.locator('#receipt').click();await page.getByText('Nachweis gespeichert',{exact:true}).waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,1);
 await f.progress();const paid=await page.evaluate(id=>client.readStatus(id),f.order.id);assert.equal(paid.paymentMode,'test');assert.equal(paid.status,'paid');assert.equal(paid.licence,'blocked');assert.equal(paid.purchaseCompleted,false);
 const receipt=await page.evaluate(id=>client.readReceipt(id),f.order.id);assert.equal(receipt.recorded,true);
 await page.evaluate(()=>window.fixtureToken='owner-b');const foreign=await page.evaluate(async id=>{try{await client.readStatus(id);}catch(e){return e.code;}},f.order.id);assert.equal(foreign,'CHECKOUT_NOT_FOUND');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal((await f.db.query('SELECT 1 FROM shop_download_invoice_consents')).rows.length,1);
 for(const table of ['billing_transactions','company_entitlements'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
 console.log('Download flow Chromium passed: explicit unchecked consent, native same-origin request, lost acknowledgement recovery with one POST, TEST payment remains blocked, company isolation, no page errors or external requests.');
 await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));await f.db.close();}

import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {shopDownloadInvoicePreviewResponse} from '../../server/shop-download-invoice-view.js';
import {invoiceSample} from './download-invoice-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH));
const sample=invoiceSample(),long=invoiceSample();long.seller.name='Anbieter '.repeat(50);long.buyer.street='W'.repeat(500);long.buyer.company_name='<script>window.hostile=true</script>';
const server=http.createServer((req,res)=>{
 const response=shopDownloadInvoicePreviewResponse(req.url==='/long'?long:sample);res.writeHead(response.status,response.headers);res.end(response.body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;try{
 browser=await chromium.launch({executablePath:process.env.SHOP_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext(),page=await context.newPage(),external=[],errors=[],csp=[];
 await page.exposeFunction('reportCsp',value=>csp.push(value));await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.reportCsp(event.violatedDirective)));
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 const dir=process.env.SHOP_BROWSER_ARTIFACTS;if(dir)await mkdir(dir,{recursive:true});
 for(const width of [1440,768,390,320])for(const endpoint of ['/','/long']){
  await page.setViewportSize({width,height:1050});const response=await page.goto(origin+endpoint);assert.equal(response.headers()['cache-control'],'private, no-store');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width} ${endpoint}`);
  assert.equal(await page.locator('.shop-status').evaluate(e=>getComputedStyle(e).color),'rgb(146, 64, 14)');assert.equal(await page.evaluate(()=>window.hostile),undefined);
  assert.equal(await page.locator('script,img,a,iframe,form').count(),0);await page.getByText('474,81', {exact:false}).first().waitFor();
  if(dir)await page.screenshot({path:path.join(dir,`invoice-${width}${endpoint==='/long'?'-long':''}.png`),fullPage:true});
 }
 await page.setViewportSize({width:794,height:1123});await page.goto(origin+'/');await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.shop-status').isVisible(),true);assert.equal(await page.locator('footer').isVisible(),true);assert.equal(await page.locator('.shop-status').evaluate(e=>getComputedStyle(e).color),'rgb(0, 0, 0)');
 if(dir)await page.screenshot({path:path.join(dir,'invoice-print.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(csp,[]);
 console.log('Invoice preview Chromium acceptance passed: 4 widths, long hostile fields, print warning, no overflow, no external requests, no CSP violations or page errors.');
 await context.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

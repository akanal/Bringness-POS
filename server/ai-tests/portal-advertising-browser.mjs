import http from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CENTER_TEST_PLAYWRIGHT||'playwright');
const root=new URL('../../apps/web/public/',import.meta.url);
const server=http.createServer(async(req,res)=>{
  try{const pathname=new URL(req.url,'http://localhost').pathname;const path=pathname.endsWith('/')?pathname+'index.html':pathname;
    if(path.includes('..'))throw Error('Invalid path');
    const bytes=await readFile(new URL('.'+path,root));
    res.writeHead(200,{'content-type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.webp')?'image/webp':'text/html'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BRINGNESS_TEST_CHROMIUM?{executablePath:process.env.BRINGNESS_TEST_CHROMIUM}:{})});const page=await browser.newPage();
  let stored=[],publicAds=[],writes=0;
  await page.addInitScript(()=>localStorage.setItem('bringness-pos-token','synthetic-owner'));
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url());let data={};
    if(url.pathname==='/api/v1/platform/advertising'){
      if(req.method()==='PUT'){writes++;const body=req.postDataJSON();stored=[{...body,version:body.version+1}];data={advertisement:stored[0]};}
      else data={advertisements:stored};
    }else if(url.pathname.endsWith('/advertising'))data={advertisements:publicAds};
    else if(url.pathname.endsWith('/restaurants'))data={restaurants:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/admin/advertising.html');await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('[name=title]').fill('Kopfhörer');await page.locator('[name=caption]').fill('Produktwerbung');await page.locator('[name=link]').fill('https://example.com/kopfhoerer');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=60;c.getContext('2d').fillRect(0,0,100,60);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#file').setInputFiles({name:'produkt.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.getElementById('notice').textContent.startsWith('Bild vorbereitet'));
  await page.locator('[name=active]').check();await page.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('notice').textContent.startsWith('Anzeige gespeichert'));
  assert.equal(writes,1);assert.equal(stored[0].active,true);
  await page.reload();await page.locator('#workspace').waitFor({state:'visible'});await page.locator('#ads').selectOption(stored[0].id);assert.equal(await page.locator('[name=title]').inputValue(),'Kopfhörer');
  await page.locator('[name=active]').uncheck();await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Sie ist pausiert'));assert.equal(stored[0].active,false);
  publicAds=[{...stored[0],active:true}];
  for(const width of [320,390,650,1280]){
    await page.setViewportSize({width,height:900});await page.goto(origin+'/bestellen/?mode=pickup&postcode=10551');
    await page.locator('.portal-advertising article').waitFor();
    assert.equal(await page.locator('.category-choice').count(),6);
    const dims=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,ad:document.querySelector('.portal-advertising').getBoundingClientRect().right}));
    assert.ok(dims.scroll<=dims.client,JSON.stringify({width,...dims}));assert.ok(dims.ad<=dims.client+1);
  }
  console.log('Chromium: image upload, save, reload, pause, six fixed icons and advertising layout at 320/390/650/1280px passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

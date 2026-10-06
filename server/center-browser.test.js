import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.CENTER_TEST_PLAYWRIGHT || 'playwright');
test('center management hides table creation until approval and after completion',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let approved=false,locked=false,tables=[];
 await page.route('http://center.test/**',async route=>{
 const req=route.request(),url=new URL(req.url());let data;
 if(url.pathname==='/center/manage.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/manage.html',import.meta.url),'utf8')});
 if(url.pathname==='/api/v1/bootstrap')data={restaurants:[]};
 else if(url.pathname==='/api/v1/centers')data={centers:[{id:'test-center',name:'Center'}]};
 else if(url.pathname.endsWith('/restaurants'))data={restaurants:[]};
 else if(url.pathname.endsWith('/setup')){
 if(req.method()==='PUT'){assert.equal(req.postDataJSON().action,'complete');locked=true;data={ok:true};}
 else data={setup:{can_setup:approved,setup_completed_at:locked?'now':null},canApprove:false};
 }else if(url.pathname.endsWith('/tables')){
 if(req.method()==='POST'){assert.equal(approved&&!locked,true);tables.push({name:req.postDataJSON().name,qr_token:'a'.repeat(48)});data={table:tables.at(-1)};}else data={tables};
 }else throw Error('Unexpected request '+url.pathname);
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('bringness-pos-token','test'));
 await page.goto('http://center.test/center/manage.html');
 await page.locator('#setupStatus').getByText('Ersteinrichtung offen.',{exact:true}).waitFor();
 assert.equal(await page.locator('#newTable').isVisible(),false);
 approved=true;await page.reload();await page.locator('#newTable').waitFor({state:'visible'});
 await page.locator('#newTable input').fill('Tisch 1');await page.locator('#newTable button').click();
 await page.locator('#tables').getByText('Gastzugang öffnen').waitFor();
 await page.locator('#setupComplete button').click();
 await page.locator('#setupStatus').getByText('Ersteinrichtung abgeschlossen.',{exact:true}).waitFor();
 assert.equal(await page.locator('#newTable').isVisible(),false);assert.equal(await page.locator('#setupComplete').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

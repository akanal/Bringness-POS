import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.CENTER_TEST_PLAYWRIGHT || 'playwright');
test('center management hides table creation until approval and after completion',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let approved=false,locked=false,tables=[],qrRequests=0;
 await page.route('https://center.test/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/api/v1/guest/center/manifest')return route.fulfill({contentType:'application/manifest+json',body:JSON.stringify({name:'Abholung',start_url:'/center/status.html#token='+url.searchParams.get('token'),display:'standalone'})});let data;
 if(url.pathname==='/center/manage.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/manage.html',import.meta.url),'utf8')});
 if(url.pathname==='/api/v1/bootstrap')data={restaurants:[]};
 else if(url.pathname==='/api/v1/centers')data={centers:[{id:'test-center',name:'Center',can_manage:true}]};
 else if(url.pathname.endsWith('/qr')){
 assert.equal(req.headers().authorization,'Bearer test');assert.equal(locked,true);qrRequests++;
 return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="white"/></svg>'});
 }else if(url.pathname.endsWith('/restaurants'))data={restaurants:[]};
 else if(url.pathname.endsWith('/setup')){
 if(req.method()==='PUT'){assert.equal(req.postDataJSON().action,'complete');locked=true;data={ok:true};}
 else data={setup:{can_setup:approved,can_export_qr:locked,setup_completed_at:locked?'now':null},canApprove:false};
 }else if(url.pathname.endsWith('/tables')){
 if(req.method()==='POST'){assert.equal(approved&&!locked,true);tables.push({id:'22222222-2222-4222-8222-222222222222',name:req.postDataJSON().name,active:true,qr_token:'a'.repeat(48)});data={table:tables.at(-1)};}else data={tables};
 }else throw Error('Unexpected request '+url.pathname);
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('bringness-pos-token','test'));
 await page.goto('https://center.test/center/manage.html');
 await page.locator('#setupStatus').getByText('Ersteinrichtung offen.',{exact:true}).waitFor();
 assert.equal(await page.locator('#newTable').isVisible(),false);
 approved=true;await page.reload();await page.locator('#newTable').waitFor({state:'visible'});
 await page.locator('#newTable input').fill('Tisch 1');await page.locator('#newTable button').click();
 await page.locator('#tables').getByText('Gastzugang öffnen').waitFor();
 await page.locator('#setupComplete button').click();
 await page.locator('#setupStatus').getByText('Ersteinrichtung abgeschlossen.',{exact:true}).waitFor();
 assert.equal(await page.locator('#newTable').isVisible(),false);assert.equal(await page.locator('#setupComplete').isVisible(),false);
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'QR-Bild herunterladen',exact:true}).click();
 const download=await downloadEvent;
 assert.equal(download.suggestedFilename(),'center-tisch-22222222-2222-4222-8222-222222222222.svg');
 assert.equal(await download.failure(),null);assert.equal(qrRequests,1);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('guest cart keeps the same payment attempt after an uncertain response',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const productId='11111111-1111-4111-8111-111111111111',restaurantId='22222222-2222-4222-8222-222222222222',requests=[];
 await page.route('https://center.test/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/center/')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/index.html',import.meta.url),'utf8')});
 let data,status=200;
 if(url.pathname.endsWith('/restaurants'))data={center:'Center',table:'1',restaurants:[{id:restaurantId,name:'Restaurant'}]};
 else if(url.pathname.endsWith('/menu'))data={restaurant:{name:'Restaurant'},orderingAvailable:true,products:[{id:productId,name:'Gericht',price_cents:1250}]};
 else if(url.pathname.endsWith('/order')){
 requests.push(req.postDataJSON());status=503;data={error:'Zahlungsstatus unklar.',cartEditable:false};
 }else throw Error('Unexpected request '+url.pathname);
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('https://center.test/center/?code='+ 'a'.repeat(48));
 await page.locator('#restaurants button').click();
 await page.getByRole('button',{name:'In den Warenkorb'}).click();
 assert.match(await page.locator('#cartTotal').textContent(),/12,50/);
 await page.locator('#checkout').click();
 await page.locator('#status').getByText(/Zahlungsstatus unklar/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Entfernen',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'In den Warenkorb'}).isDisabled(),true);
 assert.equal(await page.locator('#back').isDisabled(),true);
 await page.locator('#checkout').click();
 await page.waitForFunction(()=>!document.getElementById('checkout').disabled);
 assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
 await page.reload();
 await page.locator('#status').getByText(/Ein Zahlungsversuch ist noch gespeichert/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Entfernen',exact:true}).isDisabled(),true);
 await page.locator('#checkout').click();
 await page.locator('#status').getByText(/Zahlungsstatus unklar/).waitFor();
 assert.equal(requests.length,3);assert.deepEqual(requests[0],requests[2]);
 await page.goto('https://center.test/center/?code='+'b'.repeat(48));
 assert.equal(await page.locator('#cart').isVisible(),false);
 await page.locator('#restaurants button').click();
 await page.getByRole('button',{name:'In den Warenkorb'}).click();
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('storage unavailable');};});
 await page.locator('#checkout').click();
 await page.locator('#status').getByText(/nicht gesichert werden/).waitFor();
 assert.equal(requests.length,3);
 await page.reload();
 await page.evaluate(()=>sessionStorage.setItem('bringness-center-pending:'+'b'.repeat(48),'invalid json'));
 await page.reload();
 await page.locator('#status').getByText(/nicht geladen werden/).waitFor();
 assert.equal(await page.locator('#restaurants').isVisible(),false);
 assert.equal(await page.locator('#checkout').isDisabled(),true);
 assert.equal(requests.length,3);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('kitchen blocks later starts while allowing parallel preparations to finish',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const orders=[{id:'started',status:'preparing',items:[]},{id:'first',status:'kitchen',collection_number:'BN-2026-000042',items:[]},{id:'later',status:'kitchen',items:[]}];let actions=0;
 await page.route('https://center.test/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/center/kitchen.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/kitchen.html',import.meta.url),'utf8')});
 if(url.pathname!=='/api/v1/centers/kitchen')throw Error('Unexpected request');
 if(req.method()==='PUT'){
 actions++;const body=req.postDataJSON();assert.equal(body.orderId,'first');assert.equal(body.status,'preparing');
 return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Lager vorübergehend nicht erreichbar.'})});
 }
 return route.fulfill({contentType:'application/json',body:JSON.stringify({orders})});
 });
 await page.addInitScript(()=>localStorage.setItem('bringness-pos-token','test'));
 await page.goto('https://center.test/center/kitchen.html?restaurantId=test');
 const started=page.locator('article').filter({has:page.getByRole('heading',{name:'1. Bestellung started',exact:true})});
 const first=page.locator('article').filter({has:page.getByRole('heading',{name:'2. Bestellung first',exact:true})});
 const later=page.locator('article').filter({has:page.getByRole('heading',{name:'3. Bestellung later',exact:true})});
 await first.getByRole('button').waitFor();assert.equal(await first.getByText('Abholnummer: BN-2026-000042',{exact:true}).isVisible(),true);assert.equal(await started.getByRole('button').isEnabled(),true);
 assert.equal(await first.getByRole('button').isEnabled(),true);assert.equal(await later.getByRole('button').isDisabled(),true);
 await first.getByRole('button').click();await page.locator('#status').getByText('Lager vorübergehend nicht erreichbar.',{exact:true}).waitFor();
 assert.equal(actions,1);assert.equal(await later.getByRole('button').isDisabled(),true);assert.equal(await first.getByRole('button').isEnabled(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('guest status retains milestones through an outage and recovers online',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let offline=false,ready=false;
 await page.route('https://center.test/**',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname==='/api/v1/guest/center/manifest')return route.fulfill({contentType:'application/manifest+json',body:JSON.stringify({name:'Abholung',display:'standalone'})});
 if(url.pathname==='/center/status.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/status.html',import.meta.url),'utf8')});
 if(url.pathname==='/api/v1/guest/center/notification-config')return route.fulfill({contentType:'application/json',body:JSON.stringify({available:false})});
 if(url.pathname!=='/api/v1/guest/center/status')throw Error('Unexpected request');
 if(offline)return route.abort('internetdisconnected');
 return route.fulfill({contentType:'application/json',body:JSON.stringify({order:{restaurant_name:'Restaurant',collection_number:'BN-2026-000042',status:ready?'ready':'preparing',paid_at:'2026-10-06T12:00:00Z',preparation_started_at:'2026-10-06T12:01:00Z',ready_at:ready?'2026-10-06T12:05:00Z':null}})});
 });
 await page.goto('https://center.test/center/status.html#token='+ 'a'.repeat(64));
 await page.locator('#status').getByText('Deine Bestellung wird zubereitet.',{exact:true}).waitFor();assert.equal(await page.locator('#history li').count(),2);
 offline=true;await page.locator('#refresh').click();await page.locator('#connection').getByText(/veraltet/).waitFor();
 assert.equal(await page.locator('#status').textContent(),'Deine Bestellung wird zubereitet.');assert.equal(await page.locator('#history li').count(),2);
 offline=false;ready=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.locator('#status').getByText('Deine Bestellung ist abholbereit.',{exact:true}).waitFor();assert.equal(await page.locator('#history li').count(),3);assert.equal(await page.locator('#collection').textContent(),'Abholnummer: BN-2026-000042');assert.equal(await page.locator('#restaurant').textContent(),'Restaurant');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('guest notification enrollment requires a click and binds the status token',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();let saved;
 await page.addInitScript(()=>{
  window.permissionCalls=0;
  Object.defineProperty(window,'Notification',{configurable:true,value:{requestPermission:async()=>{window.permissionCalls++;return 'granted';}}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
  const subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'test',auth:'test'}})};
  let current=null;const registration={pushManager:{getSubscription:async()=>current,subscribe:async options=>{if(!options.userVisibleOnly)throw Error('visible push required');current=subscription;return subscription;}}};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>registration,ready:Promise.resolve(registration)}});
 });
 await page.route('https://center.test/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/center/status.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/status.html',import.meta.url),'utf8')});
  let data;
  if(url.pathname.endsWith('/notification-config'))data={available:true,publicKey:Buffer.alloc(65,1).toString('base64url')};
  else if(url.pathname.endsWith('/notifications')){saved=req.postDataJSON();data={subscribed:saved.action!=='disable'};}
  else if(url.pathname.endsWith('/status'))data={order:{restaurant_name:'Restaurant',status:'preparing'}};
  else throw Error('Unexpected request');
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('https://center.test/center/status.html#token='+'a'.repeat(64));
 await page.locator('#notify').waitFor({state:'visible'});
 assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'/api/v1/guest/center/manifest?token='+'a'.repeat(64));
 assert.equal(await page.evaluate(()=>window.permissionCalls),0);assert.equal(saved,undefined);
 await page.locator('#notify').click();
 await page.locator('#notifyStatus').getByText('Abholbenachrichtigung für diese Bestellung aktiviert.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.permissionCalls),1);assert.equal(saved.token,'a'.repeat(64));assert.equal(saved.consent,true);
 assert.equal(saved.subscription.endpoint,'https://fcm.googleapis.com/fcm/send/test');
 await page.locator('#notifyOff').click();
 await page.locator('#notifyStatus').getByText('Abholbenachrichtigung für diese Bestellung abgeschaltet.',{exact:true}).waitFor();
 assert.equal(saved.action,'disable');assert.equal(await page.evaluate(()=>window.permissionCalls),1);assert.equal(await page.locator('#notify').isVisible(),true);
 }finally{await browser.close();}
});

test('Center invitation requires login and explicit acceptance and rejects malformed links',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let accepts=0;
 await page.route('https://center.test/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/center/join.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/join.html',import.meta.url),'utf8')});
 assert.equal(url.pathname,'/api/v1/centers/invitations/accept');
 assert.equal(req.method(),'POST');assert.equal(req.headers().authorization,'Bearer operator');
 assert.deepEqual(req.postDataJSON(),{token:'a'.repeat(64)});accepts++;
 return route.fulfill({contentType:'application/json',body:JSON.stringify({joined:true})});
 });
 await page.goto('https://center.test/center/join.html#token=invalid');
 assert.equal(await page.locator('#accept').isDisabled(),true);assert.equal(accepts,0);
 await page.goto('https://center.test/center/join.html#token='+'a'.repeat(64));
 await page.locator('#accept').click();
 await page.locator('#status').getByText('Bitte zuerst mit dem Betreiberkonto in der Kasse anmelden.',{exact:true}).waitFor();
 assert.equal(accepts,0);
 await page.evaluate(()=>localStorage.setItem('bringness-pos-token','operator'));
 await page.locator('#accept').click();
 await page.locator('#status').getByText('Dein Restaurant ist dem Center zugeordnet. Die Händleranbindung wird separat eingerichtet.',{exact:true}).waitFor();
 assert.equal(accepts,1);assert.equal(await page.locator('#accept').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('a completed saved payment attempt opens guest status after reload',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();let calls=0;const requests=[];
 const productId='11111111-1111-4111-8111-111111111111',restaurantId='22222222-2222-4222-8222-222222222222';
 await page.route('https://center.test/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/center/')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/index.html',import.meta.url),'utf8')});
 if(url.pathname==='/center/status.html')return route.fulfill({contentType:'text/html',body:'<h1>Bestellstatus</h1>'});
 let data,status=200;
 if(url.pathname.endsWith('/restaurants'))data={center:'Center',table:'1',restaurants:[{id:restaurantId,name:'Restaurant'}]};
 else if(url.pathname.endsWith('/menu'))data={restaurant:{name:'Restaurant'},orderingAvailable:true,products:[{id:productId,name:'Gericht',price_cents:1250}]};
 else if(url.pathname.endsWith('/order')){
 calls++;requests.push(req.postDataJSON());
 if(calls===1){status=503;data={error:'Zahlungsstatus unklar.',cartEditable:false};}
 else data={statusUrl:'/center/status.html#token='+'a'.repeat(64),alreadyCreated:true};
 }else throw Error('Unexpected request');
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('https://center.test/center/?code='+'a'.repeat(48));
 await page.locator('#restaurants button').click();await page.getByRole('button',{name:'In den Warenkorb'}).click();
 await page.locator('#checkout').click();await page.locator('#status').getByText(/Zahlungsstatus unklar/).waitFor();
 await page.reload();await page.locator('#status').getByText(/Ein Zahlungsversuch ist noch gespeichert/).waitFor();
 await page.locator('#checkout').click();await page.getByRole('heading',{name:'Bestellstatus'}).waitFor();
 assert.equal(page.url(),'https://center.test/center/status.html#token='+'a'.repeat(64));
 assert.equal(calls,2);assert.deepEqual(requests[0],requests[1]);
 }finally{await browser.close();}
});

test('management shows merchant controls only for owned restaurants and Center actions only for its operator',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('bringness-pos-token','operator'));
 await page.route('https://center.test/**',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname==='/center/manage.html')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../apps/web/public/center/manage.html',import.meta.url),'utf8')});
 let data;
 const ownedCenter=url.pathname.includes('/owned/');
 if(url.pathname==='/api/v1/bootstrap')data={restaurants:[]};
 else if(url.pathname==='/api/v1/centers')data={centers:[{id:'owned',name:'Eigenes Center',can_manage:true},{id:'joined',name:'Beigetretenes Center',can_manage:false}]};
 else if(url.pathname.endsWith('/restaurants'))data={restaurants:ownedCenter?[
 {id:'own',name:'Eigenes Restaurant',can_manage:true,contract_status:'signed',payment_status:'verified'},
 {id:'foreign',name:'Fremdes Restaurant',can_manage:false,contract_status:'signed',payment_status:'verified'}]:
 [{id:'own',name:'Eigenes Restaurant',can_manage:true,contract_status:'signed',payment_status:'verified'}]};
 else if(url.pathname.endsWith('/setup'))data={setup:{setup_completed_at:'now',can_setup:false,can_export_qr:ownedCenter},canApprove:false};
 else if(url.pathname.endsWith('/tables'))data={tables:[{id:'table',name:'Tisch 1',active:true,qr_token:'a'.repeat(48)}]};
 else throw Error('Unexpected request');
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('https://center.test/center/manage.html');
 await page.getByRole('button',{name:'QR-Bild herunterladen',exact:true}).waitFor();
 assert.equal(await page.locator('#inviteSection').isVisible(),true);assert.equal(await page.locator('#enrollSection').isVisible(),true);
 const own=page.locator('article').filter({has:page.getByRole('heading',{name:'Eigenes Restaurant',exact:true})});
 const foreign=page.locator('article').filter({has:page.getByRole('heading',{name:'Fremdes Restaurant',exact:true})});
 assert.equal(await own.getByRole('button',{name:'Mollie verbinden'}).count(),1);
 assert.equal(await foreign.locator('form').count(),0);assert.equal(await foreign.locator('button').count(),0);
 await page.locator('#centers').selectOption('joined');
 await page.waitForFunction(()=>document.querySelectorAll('#restaurants article').length===1&&document.getElementById('tables').textContent.includes('Tisch 1'));
 assert.equal(await page.locator('#inviteSection').isVisible(),false);assert.equal(await page.locator('#enrollSection').isVisible(),false);
 assert.equal(await page.getByRole('button',{name:'QR-Bild herunterladen',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Mollie verbinden'}).count(),1);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

import assert from 'node:assert/strict';
import https from 'node:https';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {dependency} from './dependency.mjs';
import {fixture} from './fixture.mjs';
import {migrateMarketplace} from '../../server/shop-marketplace.js';
import {createMarketplaceTestIntegration} from '../../server/shop-mollie-marketplace-integration.js';
import {createMarketplaceRuntime} from '../../server/shop-marketplace-http.js';

// Entirely disposable HTTPS loopback application. Browser/provider egress is
// fenced; no production database, OAuth app, account, payment or secret is used.
const {chromium}=await import(pathToFileURL(dependency('playwright','SHOP_PLAYWRIGHT_PATH')));
const f=await fixture(),temp=await mkdtemp(join(tmpdir(),'market-payment-browser-'));
let server,browser,runtime,base,current,paymentPosts=0,redirectUrl;
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1'],{stdio:'ignore'});
 const root=fileURLToPath(new URL('../../apps/web/public/',import.meta.url));
 server=https.createServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},async(req,res)=>{
  try{if(runtime&&await runtime.handle(req,res))return;
   const path=resolve(root,'.'+new URL(req.url,'https://local').pathname);if(!path.startsWith(root)){res.writeHead(404);res.end();return;}
   const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='https://127.0.0.1:'+server.address().port;
 const integration=createMarketplaceTestIntegration(f.pool,{publicOrigin:base,clientId:'app_browserfixture',clientSecret:'fixture_not_a_real_secret',tokenKey:'ab'.repeat(32),fetcher:async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,'https://api.mollie.com');
  if(u.pathname==='/oauth2/tokens')return Response.json({access_token:'access_browser_fixture',refresh_token:'refresh_browser_fixture',expires_in:3600,token_type:'bearer',scope:'organizations.read profiles.read payments.read payments.write'});
  if(u.pathname==='/v2/organizations/me')return Response.json({id:'org_browserfixture'});
  if(u.pathname==='/v2/profiles/pfl_browserfixture')return Response.json({id:'pfl_browserfixture',status:'verified'});
  if(options.method==='POST'){
   paymentPosts++;const body=JSON.parse(options.body);assert.equal(body.testmode,true);redirectUrl=body.redirectUrl;
   current={resource:'payment',id:'tr_browserfixture',profileId:'pfl_browserfixture',mode:'test',status:'open',sequenceType:'oneoff',amount:body.amount,metadata:body.metadata,_links:{checkout:{href:'https://checkout.mollie.com/fixture'}}};throw Error('simulated lost provider response');
  }
  if(u.pathname==='/v2/payments')return Response.json({count:1,_embedded:{payments:[current]},_links:{next:null}});
  return Response.json(current);
 }});
 runtime=createMarketplaceRuntime(f.pool,{enabled:true,publicOrigin:base,...integration});await runtime.migrate();await migrateMarketplace(f.pool);
 await f.db.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved',$2)",[f.a,{name:'Browser Fixture',street:'Testweg 1',postalCode:'10115',city:'Berlin',country:'DE',email:'fixture@example.test'}]);
 const orderId=randomUUID();await f.db.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[orderId,f.a,randomUUID(),{reference:'Browser Fixture',grossCents:1190,netCents:1000,vatCents:190,currency:'EUR',lines:[]},{method:'shipping'}]);await f.db.query('INSERT INTO shop_market_orders VALUES($1,$2,$3,$4,$5)',[f.b,randomUUID(),'fixture',orderId,{}]);
 browser=await chromium.launch({headless:true,...(process.env.SHOP_BROWSER_CHANNEL?{channel:process.env.SHOP_BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===base)return route.continue();
  if(u.origin==='https://my.mollie.com'&&u.pathname==='/oauth2/authorize'){
   const callback=new URL(u.searchParams.get('redirect_uri'));assert.equal(callback.origin,base);callback.searchParams.set('state',u.searchParams.get('state'));callback.searchParams.set('code','fixture_browser_code');return route.fulfill({status:303,headers:{location:callback.href},body:''});
  }
  if(u.origin==='https://checkout.mollie.com')return route.fulfill({status:303,headers:{location:redirectUrl},body:''});
  throw Error('Unexpected browser egress: '+u.origin);
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto(base+'/shop/marketplace-seller.html');await page.evaluate(()=>localStorage.setItem('bringness-pos-token','owner-a'));
 await page.getByRole('button',{name:'Verbindungsstatus laden',exact:true}).click();await page.getByRole('button',{name:'Mollie-Konto für Test verbinden',exact:true}).waitFor({state:'visible'});
 await page.getByRole('button',{name:'Mollie-Konto für Test verbinden',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Rückkehr von Mollie. Bitte den gespeicherten Verbindungsstatus laden.'));
 await page.getByRole('button',{name:'Verbindungsstatus laden',exact:true}).click();await page.getByLabel('Mollie-Profil-ID',{exact:true}).fill('pfl_browserfixture');await page.getByRole('button',{name:'Händlerprofil prüfen',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Händlerprofil für Testzahlungen geprüft'));
 assert.equal((await f.db.query('SELECT status FROM shop_market_mollie_connections')).rows[0].status,'verified');
 await page.evaluate(()=>localStorage.setItem('bringness-pos-token','owner-b'));await page.goto(base+'/shop/marketplace-payment-return.html?marketOrderId='+orderId);
 await page.getByRole('button',{name:'Testzahlung starten',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Zahlungsantwort ist unklar'));
 assert.equal(paymentPosts,1);assert.equal(await page.getByRole('button',{name:'Testzahlung starten',exact:true}).count(),0);
 await page.getByRole('button',{name:'Zahlungsstand abgleichen',exact:true}).click();await page.getByRole('link',{name:'Testzahlung bei Mollie fortsetzen',exact:true}).waitFor();assert.equal(paymentPosts,1);
 await page.getByRole('link',{name:'Testzahlung bei Mollie fortsetzen',exact:true}).click();await page.getByRole('button',{name:'Zahlungsstand abgleichen',exact:true}).waitFor();current={...current,status:'paid'};await page.getByRole('button',{name:'Zahlungsstand abgleichen',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Testzahlung bestätigt'));
 for(const width of [390,768,1280]){
  await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.SHOP_DESIGN_ARTIFACTS){await mkdir(process.env.SHOP_DESIGN_ARTIFACTS,{recursive:true});await page.screenshot({path:join(process.env.SHOP_DESIGN_ARTIFACTS,'market-payment-'+width+'.png'),fullPage:true});}
 }
 assert.equal((await f.db.query('SELECT count(*)::int AS n FROM shop_market_test_payment_handoffs')).rows[0].n,1);assert.equal(paymentPosts,1);assert.deepEqual(errors,[]);
 await page.evaluate(()=>{localStorage.removeItem('bringness-pos-token');window.dispatchEvent(new StorageEvent('storage',{key:'bringness-pos-token'}));});assert.ok(!(await page.locator('#market-payment-return').textContent()).includes('11,90'));
 console.log('PASS: HTTPS browser consent/cookie/callback, profile, lost reply/recovery/return, test-only handoff and 390/768/1280 layouts');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await f.db.close();await rm(temp,{recursive:true,force:true});}

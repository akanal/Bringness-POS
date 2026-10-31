import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {dependency} from './dependency.mjs';
import {fixture} from './fixture.mjs';
import {createMarketplaceRuntime} from '../../server/shop-marketplace-http.js';
import {composeMarketplaceTestHost} from '../../server/shop-mollie-marketplace-host.js';
import {mountMarketReadiness,readinessLines} from '../../apps/web/public/shop/market-readiness-ui.js';
const report=()=>composeMarketplaceTestHost({}).report();
const tick=()=>new Promise(r=>setImmediate(r));
test('private readiness requires owner/admin and never exposes configuration or provider access',async()=>{
 const f=await fixture();let server,calls=0;
 try{const runtime=createMarketplaceRuntime(f.pool,{enabled:true,checkoutReadiness:()=>{calls++;return report();}});await runtime.migrate();
  server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/api/v1/shop/marketplace/merchant-readiness';
  const read=(token,suffix='',headers={})=>fetch(url+suffix,{headers:{...(token?{Authorization:'Bearer '+token}:{}),...headers}});
  assert.equal((await read()).status,401);assert.equal((await read('waiter')).status,403);assert.equal(calls,0);
  assert.equal((await read('owner-a','?companyId=other')).status,400);assert.equal((await read('owner-a','',{'sec-fetch-site':'cross-site'})).status,403);assert.equal(calls,0);
  const r=await read('owner-a');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const value=await r.json();assert.deepEqual(value,report());assert.equal(value.canPay,false);assert.equal(value.canFulfil,false);assert.equal(calls,1);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM shop_market_test_checkouts')).rows[0].n,0);
 }finally{if(server)await new Promise(r=>server.close(r));await f.db.close();}
});
test('readiness UI validates fixed codes and rejects production permission or malformed reports',()=>{
 assert.ok(readinessLines(report()).some(x=>x.startsWith('Offen:')));
 for(const changed of [{canPay:true},{canFulfil:true},{productionReady:true},{paymentMode:'live'},{checks:[{code:'secret-private',ok:false}]},{checks:[{code:'HTTPS_ORIGIN',ok:'yes'}]}])assert.throws(()=>readinessLines({...report(),...changed}),/INVALID_RESPONSE/);
 for(const changed of [{checks:[]},{blockers:[]},{blockers:['UNKNOWN']},{checks:report().checks.map(c=>({...c,ok:true})),blockers:[]}])assert.throws(()=>readinessLines({...report(),...changed}),/INVALID_RESPONSE/);
 const c={code:'HTTPS_ORIGIN',ok:true};assert.throws(()=>readinessLines({...report(),checks:[c,c]}),/INVALID_RESPONSE/);
});
test('merchant readiness clears private state and ignores late account replies',async()=>{
 const {JSDOM}=await import(pathToFileURL(dependency('jsdom','SHOP_JSDOM_PATH')));const dom=new JSDOM('<main></main>',{url:'https://bringness.de/shop/marketplace-seller.html',pretendToBeVisual:true}),w=dom.window,host=w.document.querySelector('main');let resolve,calls=0;
 try{w.localStorage.setItem('bringness-pos-token','first');mountMarketReadiness({window:w,host,client:{call(path,options){calls++;assert.equal(path,'/merchant-readiness');assert.deepEqual(options,{auth:true});return new Promise(r=>{resolve=r;});}}});
  host.querySelector('button').click();host.querySelector('button').click();assert.equal(calls,1);w.localStorage.setItem('bringness-pos-token','second');w.dispatchEvent(new w.StorageEvent('storage',{key:'bringness-pos-token'}));resolve(report());await tick();assert.equal(host.querySelectorAll('li').length,0);assert.match(host.textContent,/geschlossen/);
  host.querySelector('button').click();resolve(report());await tick();assert.ok(host.querySelectorAll('li').length>0);assert.match(host.textContent,/Echte Zahlungen und Warenfreigabe bleiben gesperrt/);w.dispatchEvent(new w.Event('pagehide'));assert.equal(host.querySelectorAll('li').length,0);
 }finally{w.close();}
});

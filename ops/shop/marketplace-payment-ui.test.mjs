import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {dependency} from './dependency.mjs';
import {mountMarketPayment} from '../../apps/web/public/shop/market-payment-ui.js';
import {mountMarketMerchant} from '../../apps/web/public/shop/market-merchant-ui.js';
import {createMarketClient} from '../../apps/web/public/shop/market-client.js';
const {JSDOM}=await import(pathToFileURL(dependency('jsdom','SHOP_JSDOM_PATH')));
const tick=()=>new Promise(r=>setImmediate(r));
const orderId=crypto.randomUUID();
const base={orderId,paymentMode:'test',paymentStatus:'not_started',amountCents:1190,currency:'EUR',canPay:false,canFulfil:false,canStartTest:true};
function setup(){const dom=new JSDOM('<main id="host"></main>',{url:'https://bringness.de/shop/marketplace.html',pretendToBeVisual:true}),w=dom.window;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.confirm=()=>true;w.localStorage.setItem('bringness-pos-token','fixture');return {w,host:w.document.getElementById('host'),close:()=>w.close()};}
const click=async(f,text)=>{const b=[...f.host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();await tick();};
test('buyer test checkout uses server amount, loses reply safely and refreshes without another start',async()=>{
 const f=setup(),calls=[];let lost=true;const client={async call(path,options){calls.push({path,options});if(path.startsWith('/checkout-availability'))return base;if(path==='/checkout'&&lost)throw Object.assign(Error(),{code:'MARKET_PAYMENT_UNCERTAIN'});return {...base,paymentStatus:'paid',canStartTest:false};}};
 try{
  mountMarketPayment({window:f.w,host:f.host,client,orderId,amountCents:1190});await click(f,'Test-Zahlungsstand laden');assert.match(f.host.textContent,/11,90/);
  await click(f,'Testzahlung starten');assert.match(f.host.textContent,/unklar/);assert.equal([...f.host.querySelectorAll('button')].some(b=>b.textContent==='Testzahlung starten'),false);
  await click(f,'Zahlungsstand abgleichen');assert.match(f.host.textContent,/Testzahlung bestätigt/);assert.match(f.host.textContent,/keine echte Zahlung/);
  assert.equal(calls.filter(c=>c.path==='/checkout').length,1);assert.deepEqual(Object.keys(calls.find(c=>c.path==='/checkout').options.body).sort(),['orderId','requestId']);
 }finally{f.close();}
});
test('foreign order, mismatched amount, live flag, goods release and hostile checkout links never become payable',async()=>{
 for(const change of [{orderId:crypto.randomUUID()},{amountCents:1},{paymentMode:'live'},{canFulfil:true},{paymentStatus:'open',checkoutUrl:'https://evil.test/'}]){
  const f=setup();try{mountMarketPayment({window:f.w,host:f.host,orderId,amountCents:1190,client:{call:async()=>({...base,...change})}});await click(f,'Test-Zahlungsstand laden');assert.equal(f.host.querySelector('a'),null);assert.equal([...f.host.querySelectorAll('button')].some(b=>b.textContent==='Testzahlung starten'),false);}finally{f.close();}
 }
});
test('payment view ignores late replies after privacy invalidation and valid links stay provider scoped',async()=>{
 const f=setup();let resolve,current=true;try{
  mountMarketPayment({window:f.w,host:f.host,orderId,amountCents:1190,isCurrent:()=>current,client:{call:()=>new Promise(r=>{resolve=r;})}});
  const b=f.host.querySelector('button');b.click();current=false;resolve({...base,paymentStatus:'open',checkoutUrl:'https://checkout.mollie.com/test'});await tick();assert.equal(f.host.querySelector('a'),null);
 }finally{f.close();}
 const g=setup();try{mountMarketPayment({window:g.w,host:g.host,orderId,amountCents:1190,client:{call:async()=>({...base,paymentStatus:'open',checkoutUrl:'https://checkout.mollie.com/test'})}});await click(g,'Test-Zahlungsstand laden');assert.equal(g.host.querySelector('a').href,'https://checkout.mollie.com/test');assert.equal(g.host.querySelector('a').referrerPolicy,'no-referrer');}finally{g.close();}
});
test('merchant panel never trusts callback query as proof; profile verification and account privacy',async()=>{
 const f=setup(),calls=[];f.w.history.replaceState(null,'','/shop/marketplace-seller.html?merchantConnection=connected');try{
  mountMarketMerchant({window:f.w,host:f.host,client:{async call(path,options){calls.push({path,options});return {configured:true,paymentMode:'test',status:path==='/merchant-verify'?'verified':'pending',paymentsEnabled:false,profileId:path==='/merchant-verify'?'pfl_fixture':null};}}});
  assert.match(f.host.textContent,/Bitte den gespeicherten Verbindungsstatus laden/);assert.equal(calls.length,0);assert.equal(f.w.location.search,'');
  await click(f,'Verbindungsstatus laden');const input=f.host.querySelector('input');input.value='pfl_fixture';f.host.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(calls.at(-1).path,'/merchant-verify');assert.deepEqual(calls.at(-1).options.body,{profileId:'pfl_fixture'});assert.match(f.host.textContent,/für Testzahlungen geprüft/);
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(input.value,'');assert.equal(f.host.querySelector('form').hidden,true);
 }finally{f.close();}
});
test('only consent start sends same-origin cookie credentials; customer checkout never sends merchant secrets',async()=>{
 const f=setup(),calls=[];try{
  const c=createMarketClient({window:f.w,fetchImpl:async(path,options)=>{calls.push(options);return {ok:true,json:async()=>({})};}});
  await c.call('/merchant-connect',{body:{},auth:true});await c.call('/checkout',{body:{orderId,requestId:crypto.randomUUID()},auth:true});
  assert.equal(calls[0].credentials,'same-origin');assert.equal(calls[1].credentials,'omit');assert.ok(!JSON.stringify(calls[1]).includes('access_token'));
 }finally{f.close();}
});

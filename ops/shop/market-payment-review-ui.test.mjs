import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountMarketPaymentReview} from '../../apps/web/public/shop/market-payment-review-ui.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const orderId='11111111-1111-4111-8111-111111111111';
const result={paymentMode:'test',canPay:false,canFulfil:false,hasMore:false,payments:[{orderId,paymentStatus:'uncertain',amountCents:1190,currency:'EUR',reviewRequired:true,overdue:true,canRecheck:true,lastCheckedAt:null}]};
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(call){const dom=new JSDOM('<main></main>',{url:'https://bringness.de/shop/marketplace-seller.html',pretendToBeVisual:true});dom.window.localStorage.setItem('bringness-pos-token','fixture');const host=dom.window.document.querySelector('main');mountMarketPaymentReview({window:dom.window,host,client:{call}});return {dom,host};}
test('merchant review renders private test state and invokes only explicit lookup',async()=>{
 const calls=[];const f=fixture(async(path,args)=>{calls.push({path,args});return {...result,confirmed:true};});try{
  assert.equal(calls.length,0);f.host.querySelector('button').click();await flush();assert.match(f.host.textContent,/Manuelle Prüfung/);assert.match(f.host.textContent,/11.90 EUR/);
  f.host.querySelector('article button').click();await flush();assert.deepEqual(calls.map(c=>c.path),['/merchant-payments','/merchant-recheck']);assert.deepEqual(calls[1].args.body,{orderId});
  f.dom.window.dispatchEvent(new f.dom.window.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(f.host.querySelector('article'),null);
 }finally{f.dom.window.close();}
});
test('account switch discards late private response and malformed live responses fail closed',async()=>{
 let release;const f=fixture(()=>new Promise(r=>{release=r;}));try{
  f.host.querySelector('button').click();f.dom.window.localStorage.setItem('bringness-pos-token','different');release(result);await flush();assert.equal(f.host.querySelector('article'),null);
 }finally{f.dom.window.close();}
 const g=fixture(async()=>({...result,paymentMode:'live'}));try{g.host.querySelector('button').click();await flush();assert.equal(g.host.querySelector('article'),null);}finally{g.dom.window.close();}
});

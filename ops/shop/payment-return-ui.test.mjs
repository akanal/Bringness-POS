import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {mountPaymentReturn} from '../../apps/web/public/shop/payment-return-ui.js';
import {mountLegacyPaymentReturnNotice} from '../../apps/web/public/shop/payment-return-notice.js';
import {shopStatuses} from '../../apps/web/public/shop/status-view.js';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),id=crypto.randomUUID();
const order=(status='prepared',monthly=false)=>({version:1,id,draftId:crypto.randomUUID(),requestId:crypto.randomUUID(),status,snapshot:{productId:monthly?'pos-online':'pos-download',planCode:monthly?'pos_base_monthly':'download_license',period:monthly?'monthly':'once',currency:'EUR',netCents:monthly?2999:39900,vatCents:monthly?570:7581,grossCents:monthly?3569:47481},canPay:false,canActivate:false,checkoutConnected:false});
async function waitFor(fn){const end=Date.now()+3000;while(!fn()){assert.ok(Date.now()<end,'return UI timed out');await new Promise(r=>setTimeout(r,5));}}
function setup(request=async()=>order()){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://fixture.test/shop/payment-return.html'}),w=dom.window,host=w.document.getElementById('host'),calls=[];let token='owner-a';const ui=mountPaymentReturn({host,id,getToken:()=>token,request:q=>{calls.push(q);return request(q);}}),click=text=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();};
 return {w,host,ui,calls,click,setToken:value=>token=value,settle:()=>waitFor(()=>ui.root.getAttribute('aria-busy')==='false'),cleanup(){ui.dispose();w.close();}};
}
test('return UI is idle until explicitly checked and every recorded state keeps its central colour/text',async()=>{
 for(const state of ['prepared','uncertain','open','paid','failed','canceled']){const f=setup(async()=>order(state));try{assert.equal(f.calls.length,0);f.click('Gespeicherten Status prüfen');await f.settle();assert.equal(f.calls.length,1);assert.equal(f.host.querySelector('[data-shop-status="'+state+'"]').dataset.tone,shopStatuses[state].tone);assert.equal(f.host.querySelector('[data-shop-status=completed]'),null);assert.match(f.host.textContent,/keine neue Anbieterprüfung/);assert.equal(f.host.querySelector('input').value,id);assert.equal(f.host.querySelector('input').readOnly,true);assert.ok(f.host.querySelector(`a[href="/shop/download-review.html#checkout=${id}"]`));}finally{f.cleanup();}}
});
test('monthly return preserves a special price and never presents Windows licence/preview actions',async()=>{
 const f=setup(async()=>order('paid',true));try{f.click('Gespeicherten Status prüfen');await f.settle();assert.match(f.host.textContent,/29,99/);assert.match(f.host.textContent,/35,69/);assert.equal(f.host.textContent.includes('34,99'),false);assert.match(f.host.textContent,/richtet kein Abonnement ein/);assert.equal(f.host.querySelector('a[href*="download-review.html"]'),null);assert.ok(f.host.querySelector('a[href="/shop/account.html"]'));}finally{f.cleanup();}
});
test('single flight ignores duplicate checks; transient failure labels the retained record as an older state',async()=>{
 let resolve,n=0;const f=setup(()=>{if(++n===1)return new Promise(r=>resolve=r);throw Error('private network diagnostic');});try{
  f.click('Gespeicherten Status prüfen');f.click('Gespeicherten Status prüfen');assert.equal(f.calls.length,1);resolve(order('open'));await f.settle();f.click('Gespeicherten Status prüfen');await f.settle();assert.equal(f.host.querySelector('input').value,id);assert.match(f.host.textContent,/älterer Stand/);assert.equal(f.host.textContent.includes('private'),false);
 }finally{f.cleanup();}
});
test('same-tab account change discards a late record and changed credentials remove existing records',async()=>{
 let resolve;const f=setup(()=>new Promise(r=>resolve=r));try{f.click('Gespeicherten Status prüfen');f.setToken('owner-b');resolve(order('paid'));await waitFor(()=>f.host.textContent.includes('Konto hat gewechselt'));assert.equal(f.host.querySelector('input'),null);}finally{f.cleanup();}
 const g=setup();try{g.click('Gespeicherten Status prüfen');await g.settle();g.setToken('owner-b');g.w.dispatchEvent(new g.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(g.host.querySelector('input'),null);assert.equal(g.calls.length,1);}finally{g.cleanup();}
});
test('offline and visibility clear private state; reconnect never checks automatically',async()=>{
 const f=setup();try{f.click('Gespeicherten Status prüfen');await f.settle();Object.defineProperty(f.w.navigator,'onLine',{value:false,configurable:true});f.w.dispatchEvent(new f.w.Event('offline'));assert.equal(f.host.querySelector('input'),null);assert.equal(f.host.querySelector('button').disabled,true);Object.defineProperty(f.w.navigator,'onLine',{value:true,configurable:true});f.w.dispatchEvent(new f.w.Event('online'));assert.equal(f.calls.length,1);f.click('Gespeicherten Status prüfen');await f.settle();Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.host.querySelector('input'),null);}finally{f.cleanup();}
});
test('copy fallback is user-triggered and account changes block stale navigation',async()=>{
 const f=setup();try{f.click('Gespeicherten Status prüfen');await f.settle();f.click('Vorgangsnummer kopieren');await waitFor(()=>f.host.textContent.includes('Vorgangsnummer markiert'));assert.equal(f.calls.length,1);const a=f.host.querySelector('a');f.setToken('owner-b');const event=new f.w.MouseEvent('click',{cancelable:true,bubbles:true});a.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(f.host.querySelector('input'),null);}finally{f.cleanup();}
});
test('legacy notice retains only the exact reference, performs no lookup and closes with a useful focus target',()=>{
 const dom=new JSDOM('<input id="search"><section id="notice" hidden></section>'),d=dom.window.document,host=d.getElementById('notice');try{
  mountLegacyPaymentReturnNotice({host,href:'https://fixture.test/shop/?checkout=return&order='+id});assert.equal(host.hidden,false);assert.equal(host.querySelector('a').getAttribute('href'),'/shop/payment-return.html#checkout='+id);assert.match(host.textContent,/bestätigt noch keine Zahlung/);host.querySelector('button').click();assert.equal(host.hidden,true);assert.equal(d.activeElement.id,'search');
  mountLegacyPaymentReturnNotice({host,href:'https://fixture.test/shop/?checkout=return&order='+id+'&status=paid&token=secret'});assert.equal(host.querySelector('a[href*="payment-return.html"]'),null);assert.equal(host.textContent.includes('secret'),false);assert.match(host.textContent,/nicht eindeutig/);
 }finally{dom.window.close();}
});
test('malformed or denied responses never render another account and disposal blocks delayed data',async()=>{
 const f=setup(async()=>({...order(),canActivate:true}));try{f.click('Gespeicherten Status prüfen');await f.settle();assert.equal(f.host.querySelector('input'),null);assert.match(f.host.textContent,/kein Zahlungsnachweis/);}finally{f.cleanup();}
 let resolve;const g=setup(()=>new Promise(r=>resolve=r));try{g.click('Gespeicherten Status prüfen');g.host.replaceChildren();await new Promise(r=>setTimeout(r,0));resolve(order());await new Promise(r=>setTimeout(r,0));assert.equal(g.ui.root.childElementCount,0);}finally{g.cleanup();}
});
test('monthly return links to combined history and public status help without an extra request',async()=>{const f=setup(async()=>order('uncertain',true));try{f.click('Gespeicherten Status prüfen');await f.settle();assert.ok(f.host.querySelector('a[href="/shop/order-history.html"]'));assert.ok(f.host.querySelector('a[href="/shop/help.html#topic=status-uncertain"]'));assert.equal(f.calls.length,1);}finally{f.cleanup();}});

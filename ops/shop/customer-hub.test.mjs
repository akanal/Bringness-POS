import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {dependency} from './dependency.mjs';
import {currentShopQuote,shopDate,draftPhase} from '../../apps/web/public/shop/review-state.js';
import {shopPreview} from '../../server/shop-preview-policy.js';
import {fixture as databaseFixture} from './fixture.mjs';
import {migrateShopDrafts,saveShopDraft,readShopDraft} from '../../server/shop-drafts.js';
const tick=()=>new Promise(r=>setTimeout(r,20));
async function waitFor(predicate){const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,'timed out waiting for the account result');await new Promise(r=>setTimeout(r,5));}}
test('review presentation rejects expired quotes and formats explicit Berlin dates',()=>{
 assert.equal(currentShopQuote({issues:[],expiresAt:'2026-10-24T12:05:00Z'},Date.parse('2026-10-24T12:00:00Z')),true);
 assert.equal(currentShopQuote({issues:[],expiresAt:'2026-10-24T12:00:00Z'},Date.parse('2026-10-24T12:00:00Z')),false);
 assert.equal(currentShopQuote({issues:['already_active'],expiresAt:'2099-01-01'}),false);assert.equal(currentShopQuote(null),false);
 assert.match(shopDate('2026-10-24T12:00:00Z'),/14:00/);assert.equal(shopDate('invalid'),'Unbekannt');
 assert.equal(draftPhase({status:'canceled',expired:true}),'Entwurf verworfen');assert.equal(draftPhase({status:'draft',expired:true}),'Entwurf abgelaufen');
});
async function fixture(suffix,{fetcher,before}={}){
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
 const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url:'https://fixture.example.test/shop/',pretendToBeVisual:true}),w=dom.window,old={};
 for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
 const requests=[];globalThis.fetch=(url,options)=>{requests.push({url,options});if(!fetcher)throw Error('unexpected network');return fetcher(url,options);};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const $=id=>w.document.getElementById(id),click=(selector,text)=>{const b=[...w.document.querySelectorAll(selector)].find(b=>b.textContent===text);assert.ok(b,text);b.click();return b;};
 const cleanup=()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();};
 try{before?.(w);await import('../../apps/web/public/shop/shop.js?'+suffix);}catch(e){cleanup();throw e;}
 return {w,$,click,requests,cleanup};
}
test('Mein Shop and empty cart recover an authenticated server draft without creating another',async()=>{
 const dbf=await databaseFixture();let f;try{
  await migrateShopDrafts(dbf.pool);const draft=await saveShopDraft(dbf.pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}});
  f=await fixture('hub-recovery',{before:w=>w.localStorage.setItem('bringness-pos-token','owner-a'),fetcher:async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer owner-a');return Response.json(await readShopDraft(dbf.pool,{token:'owner-a',active:true}));}});
  const {$,click,w}=f;$('shop-account-open').click();assert.equal($('shop-account-dialog').open,true);assert.match($('shop-account-summary').textContent,/0Artikel/);
  $('hub-drafts').click();await waitFor(()=>/Entwurf gespeichert/.test($('draft-result').textContent));assert.equal($('review-dialog').open,true);assert.equal($('account-check').disabled,true);assert.match($('draft-result').textContent,/Entwurf gespeichert/);assert.match($('draft-result').textContent,/Erstellt:/);assert.equal(w.document.querySelector('#draft-result input[readonly]').value,draft.id);assert.equal($('cart-count').textContent,'0');
  click('#draft-result button','Entwurfsnummer kopieren');await tick();assert.match($('draft-result').textContent,/markiert/);
  $('review-back').click();assert.equal($('cart-dialog').open,true);click('#cart-content button','Gespeicherten Entwurf suchen');await waitFor(()=>f.requests.length===2&&$('review-dialog').getAttribute('aria-busy')==='false');assert.equal($('review-dialog').open,true);assert.equal(f.requests.length,2);assert.equal((await dbf.db.query('SELECT 1 FROM shop_order_drafts')).rows.length,1);assert.ok(f.requests.every(r=>r.options.method==='GET'));
 }finally{f?.cleanup();await dbf.db.close();}
});
test('review single flight prevents duplicate requests and price expiry keeps recovery enabled',async()=>{
 let respond,expiry;const f=await fixture('single-flight',{before:w=>{w.localStorage.setItem('bringness-pos-token','fixture');const native=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>{if(ms>60000){expiry=fn;return 12345;}return native(fn,ms,...args);};},fetcher:()=>new Promise(r=>respond=r)});
 const {$,click}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();$('review-open').click();$('account-check').click();$('account-check').click();$('draft-recover').click();await tick();assert.equal(f.requests.length,1);assert.equal($('review-dialog').getAttribute('aria-busy'),'true');assert.equal($('review-busy').hidden,false);assert.equal($('review-back').disabled,false);
  const q=shopPreview({cart:{'pos-online':1},plans:[{code:'pos_base_monthly',amount_cents:3499,billing_type:'monthly',currency:'EUR',active:true}],profile:{company_name:'Fixture',street:'Example 1',postal_code:'10115',city:'Berlin',country:'DE'}});
  respond(Response.json(q));await tick();assert.equal($('review-dialog').getAttribute('aria-busy'),'false');assert.equal($('draft-save').disabled,false);assert.equal($('account-status').dataset.shopStatus,'quote');assert.equal($('quote-validity').dataset.tone,'info');assert.match($('quote-validity').textContent,/gültig bis/);assert.equal(typeof expiry,'function');expiry();assert.equal($('draft-save').disabled,true);assert.equal($('draft-recover').disabled,false);assert.match($('quote-validity').textContent,/abgelaufen/);assert.equal($('quote-validity').dataset.tone,'warning');assert.equal($('account-status').dataset.shopStatus,'expired');assert.equal(f.requests.length,1);
 }finally{f.cleanup();}
});
test('offline status blocks server actions; reconnect never auto-replays them',async()=>{
 const f=await fixture('offline-hub',{before:w=>{w.localStorage.setItem('bringness-pos-token','fixture');Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});}});
 const {$,w}=f;try{
  $('shop-account-open').click();$('hub-drafts').click();await tick();assert.equal(f.requests.length,0);assert.match($('review-connectivity').textContent,/Offline/);assert.match($('account-status').textContent,/nichts automatisch/);
  Object.defineProperty(w.navigator,'onLine',{value:true,configurable:true});w.dispatchEvent(new w.Event('online'));await tick();assert.equal(f.requests.length,0);assert.equal($('review-connectivity').textContent,'');
 }finally{f.cleanup();}
});
test('closing busy review discards a late response and releases controls',async()=>{
 let respond;const f=await fixture('closed-request',{before:w=>w.localStorage.setItem('bringness-pos-token','fixture'),fetcher:()=>new Promise(r=>respond=r)});const {$,click}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();$('review-open').click();$('account-check').click();await tick();$('review-back').click();assert.equal($('review-busy').hidden,true);respond(Response.json({secret:'stale response'}));await tick();assert.equal($('account-result').textContent,'');assert.equal($('draft-controls').hidden,true);assert.equal($('review-dialog').getAttribute('aria-busy'),'false');
 }finally{f.cleanup();}
});
test('comparison links open details; empty wishlist returns to assortment; quantity cap is explicit',async()=>{
 const f=await fixture('customer-shortcuts'),{$,click,w}=f;try{
  $('saved-open').click();click('#saved-content button','Sortiment ansehen');assert.equal($('saved-dialog').open,false);
  click('.product-tools button','Vergleichen');$('compare-open').click();click('.comparison-product-link','Bringness POS Online');assert.equal($('detail-dialog').open,true);assert.equal($('compare-dialog').open,false);assert.equal($('compare-count').textContent,'1');$('detail-dialog').close();
  click('.card-actions button','In den Warenkorb');$('cart-open').click();const input=w.document.querySelector('#cart-content input');input.value=99;input.dispatchEvent(new w.Event('change'));$('cart-dialog').close();click('.card-actions button','In den Warenkorb');assert.equal($('cart-count').textContent,'99');assert.match($('cart-feedback-product').textContent,/Höchstmenge/);assert.ok(!f.requests.length);
 }finally{f.cleanup();}
});

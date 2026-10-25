import {dependency} from './dependency.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {shopPreview} from '../../server/shop-preview-policy.js';
const require=createRequire(import.meta.url);const {JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
test('real shop DOM: search cart dialogs account response invalidation',async()=>{
 const dom=new JSDOM(html,{url:'https://shop.example.test/shop/',pretendToBeVisual:true});const w=dom.window;const old={};for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const $=id=>w.document.getElementById(id);let respond;
 globalThis.fetch=()=>new Promise(resolve=>respond=resolve);
 try{
  await import('../../apps/web/public/shop/shop.js?dom');assert.equal(w.document.querySelectorAll('.card').length,3);
  $('search').value='windows';$('search').dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('.card').length,1);
  w.document.querySelector('.card-actions button:last-child').click();assert.equal($('cart-count').textContent,'1');assert.ok(!w.sessionStorage.getItem('bringness.shop.cart.v2').includes('39900'));
  $('cart-open').click();assert.equal($('cart-dialog').open,true);assert.match($('cart-content').textContent,/474,81/);
  $('review-open').click();assert.equal($('review-dialog').open,true);assert.equal($('cart-dialog').open,false);
  $('account-check').click();await tick();assert.match($('account-status').textContent,/zuerst/);
  w.localStorage.setItem('bringness-pos-token','synthetic-token');$('account-check').click();await tick();assert.ok(respond);
  const q=shopPreview({cart:{'pos-download':1},plans:[{code:'download_license',amount_cents:39900,billing_type:'one_time',currency:'EUR',active:true}],profile:{company_name:'Fixture',street:'Example 1',postal_code:'10115',city:'Berlin',country:'DE'}});
  respond({ok:true,json:async()=>q});await tick();assert.match($('account-status').textContent,/erfolgreich/);assert.equal($('draft-save').disabled,false);
  for(const [issue,expected] of [['download_buyer_unsupported',/deutscher Rechnungsanschrift/],['download_invoice_format_not_ready',/aktuelle Datum/]]){
   $('account-check').click();await tick();respond({ok:true,json:async()=>({...q,issues:[issue]})});await tick();assert.match($('account-result').textContent,expected);assert.equal($('draft-save').disabled,true);
  }
  $('account-check').click();await tick();$('review-back').click();respond({ok:true,json:async()=>q});await tick();assert.equal($('review-dialog').open,false);assert.equal($('account-result').textContent,'');
  $('review-open').click();$('account-check').click();await tick();const stale=respond;w.localStorage.setItem('bringness-pos-token','different-account');w.dispatchEvent(new w.StorageEvent('storage',{key:'bringness-pos-token'}));stale({ok:true,json:async()=>q});await tick();assert.equal($('account-result').textContent,'');assert.equal($('draft-controls').hidden,true);
  assert.ok([...w.document.querySelectorAll('#review-dialog button')].some(b=>b.disabled&&/Zahlung/.test(b.textContent)));
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {dependency} from './dependency.mjs';
import {products} from '../../apps/web/public/shop/catalog.js';
import {catalogAmounts,alternatives} from '../../apps/web/public/shop/product-view.js';
test('product amounts are cent-exact and undecided AI is not a free item',()=>{
 assert.deepEqual(catalogAmounts(products[0]),{netCents:3499,vatCents:665,grossCents:4164});
 assert.deepEqual(catalogAmounts(products[1]),{netCents:39900,vatCents:7581,grossCents:47481});
 assert.equal(catalogAmounts(products[2]),null);
 assert.deepEqual(alternatives(products[0]).map(p=>p.id),['pos-download']);assert.deepEqual(alternatives(products[2]),[]);
});

async function fixture(suffix){
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
 const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url:'https://fixture.example.test/shop/',pretendToBeVisual:true}),w=dom.window,old={};
 for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
 let calls=0;globalThis.fetch=()=>{calls++;throw Error('unexpected network');};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const $=id=>w.document.getElementById(id),click=(selector,text)=>{const b=[...w.document.querySelectorAll(selector)].find(b=>b.textContent===text);assert.ok(b,text);b.focus();b.click();return b;};
 const cleanup=()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();};
 try{await import('../../apps/web/public/shop/shop.js?'+suffix);}catch(e){cleanup();throw e;}
 return {w,$,click,cleanup,calls:()=>calls};
}

test('structured product view supports FAQs, compare, alternatives and AI without a buy action',async()=>{
 const f=await fixture('product-page'),{w,$,click}=f;try{
  click('.card-actions button','Details ansehen');assert.equal(w.document.querySelectorAll('.product-purchase').length,1);assert.match($('detail-facts').textContent,/Im Browser/);assert.equal(w.document.querySelectorAll('.product-questions details').length,4);
  click('.product-purchase button','Vergleichen');assert.equal($('compare-count').textContent,'1');click('.product-purchase button','Aus Vergleich entfernen');assert.equal($('compare-count').textContent,'0');
  click('.product-alternatives button','Bringness POS für Windows');assert.match($('detail-title').textContent,/Windows/);assert.match($('detail-facts').textContent,/Windows-Download/);assert.match($('detail-content').textContent,/474,81/);assert.equal($('cart-count').textContent,'0');
  $('detail-dialog').close();$('search').value='AI';$('search').dispatchEvent(new w.Event('input'));click('.card-actions button','Details ansehen');assert.match($('detail-title').textContent,/AI/);assert.equal([...w.document.querySelectorAll('.product-purchase button')].some(b=>b.textContent==='In den Warenkorb'),false);assert.equal(w.document.querySelector('.product-alternatives'),null);assert.match($('detail-content').textContent,/Preis folgt/);assert.equal(f.calls(),0);
 }finally{f.cleanup();}
});

test('save for later and undo preserve quantity; failed wishlist persistence keeps cart intact',async()=>{
 const f=await fixture('cart-save-later'),{$,click,w}=f;try{
  click('.card-actions button','In den Warenkorb');click('.card-actions button','In den Warenkorb');$('cart-open').click();
  click('#cart-content button','Für später merken');assert.equal($('cart-count').textContent,'0');assert.equal($('saved-count').textContent,'1');assert.equal($('review-open').disabled,true);
  click('#cart-undo button','Entfernen rückgängig');assert.equal($('cart-count').textContent,'2');assert.match($('cart-issues').textContent,/Menge auf 1/);assert.equal($('cart-undo').textContent,'');
  const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key==='bringness.shop.saved.v1')throw Error('storage full');return original.call(this,key,value);};
  click('#cart-content button','Für später merken');assert.equal($('cart-count').textContent,'2');assert.match($('storage-status').textContent,/bleibt im Warenkorb/);w.Storage.prototype.setItem=original;
  assert.equal(JSON.parse(w.sessionStorage.getItem('bringness.shop.cart.v2'))['pos-online'],2);assert.equal(f.calls(),0);
 }finally{f.cleanup();}
});

test('undo refuses to truncate quantities above the cart limit',async()=>{
 const f=await fixture('undo-cart-limit'),{$,click,w}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();const qty=w.document.querySelector('#cart-content input');qty.value=99;qty.dispatchEvent(new w.Event('change'));click('#cart-content button','Entfernen');$('cart-dialog').close();click('.card-actions button','In den Warenkorb');$('cart-open').click();click('#cart-undo button','Entfernen rückgängig');assert.equal($('cart-count').textContent,'1');assert.match($('announcement').textContent,/Höchstmenge/);assert.ok($('cart-undo').textContent.includes('rückgängig'));
 }finally{f.cleanup();}
});

test('category counts follow filters; filter disclosure and comparison reset preserve browsing',async()=>{
 const f=await fixture('facet-controls'),{w,$,click}=f;try{
  assert.match(w.document.querySelector('[data-category="Software"]').textContent,/\(3\)/);$('period-filter').value='once';$('period-filter').dispatchEvent(new w.Event('change'));assert.match(w.document.querySelector('[data-category="Software"]').textContent,/\(1\)/);
  $('filter-toggle').click();assert.equal($('filter-toggle').getAttribute('aria-expanded'),'false');assert.equal($('filter-panel').classList.contains('filters-collapsed'),true);$('filter-toggle').click();
  click('.product-tools button','Vergleichen');$('compare-open').click();$('compare-clear').click();assert.equal($('compare-count').textContent,'0');assert.equal($('compare-clear').disabled,true);assert.equal($('period-filter').value,'once');
  assert.equal(w.document.querySelector('.checkout-steps [aria-current]').textContent,'2 · Konto & Entwurf');assert.equal(f.calls(),0);
 }finally{f.cleanup();}
});

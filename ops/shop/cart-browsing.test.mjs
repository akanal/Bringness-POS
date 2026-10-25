import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';import {lineAmounts,quantityValue} from '../../apps/web/public/shop/cart-view.js';import {searchSegments} from '../../apps/web/public/shop/search-view.js';
test('cart quantities and position amounts stay integer-based with line VAT rounding',()=>{
 for(const value of ['',0,100,'1.5','invalid'])assert.equal(quantityValue(value),null);assert.equal(quantityValue('2'),2);assert.equal(quantityValue(99),99);
 assert.deepEqual(lineAmounts({netCents:10497}),{netCents:10497,vatCents:1994,grossCents:12491});
});
test('search segments merge overlaps and preserve original text without markup parsing',()=>{
 for(const query of ['POS pos','Online POS','<script>','[.*+?']){const segments=searchSegments('Bringness POS Online',query);assert.equal(segments.map(s=>s.text).join(''),'Bringness POS Online');}
 assert.deepEqual(searchSegments('POS Online','pos os').filter(s=>s.match).map(s=>s.text),['POS']);
 assert.equal(searchSegments('POS','').some(s=>s.match),false);assert.equal(searchSegments('für','fu\u0308r').find(s=>s.match).text,'für');
});
async function fixture(suffix,{before}={}){
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
 const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url:'https://fixture.example.test/shop/',pretendToBeVisual:true}),w=dom.window,old={};for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
 let requests=0;globalThis.fetch=()=>{requests++;throw Error('unexpected network');};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const $=id=>w.document.getElementById(id),click=(selector,text)=>{const b=[...w.document.querySelectorAll(selector)].find(b=>b.textContent===text);assert.ok(b,text);b.focus();b.click();return b;};
 const cleanup=()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();};try{before?.(w);await import('../../apps/web/public/shop/shop.js?'+suffix);}catch(e){cleanup();throw e;}
 return {w,$,click,cleanup,requests:()=>requests};
}
test('cart steppers keep focus, show line amounts and reject invalid edits without losing totals',async()=>{
 const f=await fixture('cart-controls'),{w,$,click}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();assert.match(w.document.querySelector('.basket-line-sum').textContent,/41,64/);assert.equal(w.document.querySelector('[data-cart-action="minus"]').disabled,true);
  const plus=w.document.querySelector('[data-cart-action="plus"]');plus.focus();plus.click();assert.equal($('cart-count').textContent,'2');assert.equal(w.document.activeElement.dataset.cartAction,'plus');assert.match(w.document.querySelector('.basket-line-sum').textContent,/83,28/);
  const input=w.document.querySelector('[data-cart-action="quantity"]');input.value='1.5';input.dispatchEvent(new w.Event('change'));assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal($('review-open').disabled,true);assert.equal($('cart-count').textContent,'2');assert.match(w.document.querySelector('.quantity-error').textContent,/unverändert/);
  input.value='1';input.focus();input.dispatchEvent(new w.Event('change'));assert.equal($('cart-count').textContent,'1');assert.equal($('review-open').disabled,false);assert.equal(w.document.activeElement.dataset.cartAction,'quantity');assert.equal(f.requests(),0);
 }finally{f.cleanup();}
});
test('cart details stack above cart; adding there recalculates and returns focus',async()=>{
 const f=await fixture('cart-detail-stack'),{w,$,click}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();click('#cart-content button','Details ansehen');assert.equal($('cart-dialog').open,true);assert.equal($('detail-dialog').open,true);
  click('.product-purchase button','In den Warenkorb');assert.equal($('detail-dialog').open,false);assert.equal($('cart-dialog').open,true);assert.equal($('cart-count').textContent,'2');assert.match(w.document.querySelector('.basket-line-sum').textContent,/83,28/);assert.equal(w.document.activeElement.dataset.cartAction,'details');
 }finally{f.cleanup();}
});
test('filter chips remove exactly one constraint and highlighting is safe text',async()=>{
 const f=await fixture('filter-chips'),{w,$}=f;try{
  $('search').value='Windows POS';$('search').dispatchEvent(new w.Event('input'));$('period-filter').value='once';$('period-filter').dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.card h3 mark').length,2);
  w.document.querySelector('[data-filter="period"]').click();assert.equal($('period-filter').value,'all');assert.equal($('search').value,'Windows POS');assert.equal(w.document.querySelectorAll('.card').length,1);assert.equal(w.document.activeElement.dataset.filter,'query');
  w.document.querySelector('[data-filter="query"]').click();assert.equal(w.document.querySelectorAll('.card').length,3);assert.equal(w.document.activeElement.id,'search');
  $('search').value='<img src=x>';$('search').dispatchEvent(new w.Event('input'));assert.equal($('active-filters').querySelector('img'),null);
 }finally{f.cleanup();}
});
test('comparison restores only valid product IDs and clears durable session selection',async()=>{
 const f=await fixture('compare-storage',{before:w=>w.sessionStorage.setItem('bringness.shop.compare.v1',JSON.stringify(['pos-online','foreign','pos-online','bringness-ai']))}),{$,w,click}=f;try{
  assert.equal($('compare-count').textContent,'2');$('compare-open').click();assert.match($('compare-content').textContent,/Preis folgt/);$('compare-clear').click();assert.equal(w.sessionStorage.getItem('bringness.shop.compare.v1'),'[]');assert.equal($('compare-count').textContent,'0');$('compare-dialog').close();click('.product-tools button','Vergleichen');assert.deepEqual(JSON.parse(w.sessionStorage.getItem('bringness.shop.compare.v1')),['pos-online']);
 }finally{f.cleanup();}
});
test('comparison print scope cleans after print and adjacent navigation respects results',async()=>{
 const f=await fixture('print-pagination'),{$,w,click}=f;try{
  let prints=0;w.print=()=>{prints++;};click('.product-tools button','Vergleichen');$('compare-open').click();$('compare-print').click();assert.equal(prints,1);assert.equal(w.document.body.classList.contains('printing-comparison'),true);w.dispatchEvent(new w.Event('afterprint'));assert.equal(w.document.body.classList.contains('printing-comparison'),false);$('compare-dialog').close();
  click('.card-actions button','Details ansehen');assert.equal([...w.document.querySelectorAll('.product-pagination button')].find(b=>b.textContent==='Vorheriges Produkt').disabled,true);click('.product-pagination button','Nächstes Produkt');assert.match($('detail-title').textContent,/Windows/);click('.product-pagination button','Nächstes Produkt');assert.match($('detail-title').textContent,/AI/);assert.equal([...w.document.querySelectorAll('.product-pagination button')].find(b=>b.textContent==='Nächstes Produkt').disabled,true);assert.equal($('cart-count').textContent,'0');
 }finally{f.cleanup();}
});

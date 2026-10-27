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
test('non-modal cart permits background search and adding, with live quantities and count',async()=>{const f=await fixture('cart-dock-browsing'),{w,$,click}=f;try{let modalCalls=0,plainCalls=0;const original=w.HTMLDialogElement.prototype.showModal;w.HTMLDialogElement.prototype.showModal=function(){modalCalls++;original.call(this);};w.HTMLDialogElement.prototype.show=function(){plainCalls++;this.open=true;};$('cart-open').click();assert.equal(plainCalls,1);assert.equal(modalCalls,0);assert.equal($('cart-dialog').getAttribute('aria-modal'),'false');assert.equal($('cart-open').getAttribute('aria-expanded'),'true');assert.equal(w.document.body.classList.contains('cart-dock-open'),true);$('search').value='Online';$('search').dispatchEvent(new w.Event('input'));assert.equal($('cart-dialog').open,true);click('.card-actions button','In den Warenkorb');click('.card-actions button','In den Warenkorb');assert.equal($('cart-summary').textContent,'2 Artikel');assert.match($('cart-content').textContent,/83,28/);assert.equal($('cart-feedback').hidden,true);assert.equal($('cart-dialog').open,true);$('cart-open').click();assert.equal($('cart-dialog').open,false);assert.equal(w.document.body.classList.contains('cart-dock-open'),false);assert.equal($('cart-open').getAttribute('aria-expanded'),'false');assert.equal($('cart-count').textContent,'2');assert.equal(f.requests(),0);}finally{f.cleanup();}});
test('cart can minimize, expand from footer, continue browsing and close with Escape',async()=>{const f=await fixture('cart-dock-controls'),{w,$}=f;try{$('cart-open').click();$('cart-minimize').click();assert.equal($('cart-minimize').getAttribute('aria-expanded'),'false');assert.equal(w.document.body.classList.contains('cart-dock-collapsed'),true);$('footer-checkout').click();assert.equal($('cart-minimize').getAttribute('aria-expanded'),'true');assert.equal($('cart-dialog').open,true);const key=new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});$('cart-dialog').dispatchEvent(key);assert.equal(key.defaultPrevented,false);$('search').focus();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal($('cart-dialog').open,false);assert.equal(w.document.activeElement,$('cart-open'));$('cart-open').click();$('cart-dialog').querySelector('.dialog-actions [data-close]').click();assert.equal($('cart-dialog').open,false);assert.equal(w.document.body.classList.contains('cart-dock-open'),false);}finally{f.cleanup();}});
test('Escape does not dismiss the cart beneath an explicit product or review modal',async()=>{const f=await fixture('cart-dock-modal-boundary'),{w,$,click}=f;try{click('.card-actions button','In den Warenkorb');$('cart-open').click();click('#cart-content button','Details ansehen');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal($('cart-dialog').open,true);$('detail-dialog').close();$('review-open').click();assert.equal($('cart-dialog').open,false);assert.equal($('review-dialog').open,true);assert.equal(w.document.body.classList.contains('cart-dock-open'),false);$('review-back').click();assert.equal($('cart-dialog').open,true);assert.equal($('review-dialog').open,false);assert.equal($('cart-summary').textContent,'1 Artikel');}finally{f.cleanup();}});
test('saved removal undo restores order and comparison/cart actions retain explicit selection',async()=>{const f=await fixture('selection-tools',{before:w=>w.sessionStorage.setItem('bringness.shop.saved.v1',JSON.stringify(['pos-online','pos-download','bringness-ai']))}),{$,w}=f;try{$('saved-open').click();w.document.querySelector('[data-saved-row=pos-download] [data-saved-action=remove]').click();assert.equal($('saved-count').textContent,'2');assert.match($('saved-undo').textContent,/Windows/);$('saved-undo').querySelector('button').click();assert.deepEqual(JSON.parse(w.sessionStorage.getItem('bringness.shop.saved.v1')),['pos-online','pos-download','bringness-ai']);assert.equal(w.document.activeElement.dataset.savedId,'pos-download');w.document.querySelector('[data-saved-row=pos-online] [data-saved-action=compare]').click();assert.equal($('compare-count').textContent,'1');w.document.querySelector('[data-saved-row=pos-online] [data-saved-action=cart]').click();assert.equal($('saved-dialog').open,false);assert.equal($('cart-dialog').open,true);assert.equal($('cart-count').textContent,'1');$('cart-open').click();$('saved-open').click();const existing=w.document.querySelector('[data-saved-row=pos-online] [data-saved-action=cart]');assert.equal(existing.disabled,true);existing.click();assert.equal($('cart-count').textContent,'1');assert.equal(f.requests(),0);}finally{f.cleanup();}});
test('comparison hides only equal facts and supports remembering and explicit cart transfer',async()=>{const f=await fixture('comparison-tools',{before:w=>w.sessionStorage.setItem('bringness.shop.compare.v1',JSON.stringify(['pos-online','pos-download']))}),{$,w}=f;try{$('compare-open').click();const rows=()=>Array.from(w.document.querySelectorAll('.comparison-table tbody tr:not(.comparison-actions)'));assert.equal(rows().length,6);$('compare-differences').checked=true;$('compare-differences').dispatchEvent(new w.Event('change'));assert.equal(rows().length,5);w.document.querySelector('[data-compare-id=pos-online][data-compare-action=save]').focus();w.document.querySelector('[data-compare-id=pos-online][data-compare-action=save]').click();assert.equal($('saved-count').textContent,'1');assert.equal(w.document.activeElement.dataset.compareAction,'save');w.document.querySelector('[data-compare-id=pos-online][data-compare-action=cart]').click();assert.equal($('compare-dialog').open,false);assert.equal($('cart-dialog').open,true);assert.equal($('cart-count').textContent,'1');$('cart-open').click();$('compare-open').click();assert.equal(w.document.querySelector('[data-compare-id=pos-online][data-compare-action=cart]').disabled,true);w.document.querySelector('[data-compare-id=pos-online][data-compare-action=remove]').focus();w.document.querySelector('[data-compare-id=pos-online][data-compare-action=remove]').click();assert.equal($('compare-differences').disabled,true);assert.equal(rows().length,6);assert.equal(w.document.activeElement.dataset.compareId,'pos-download');assert.equal(f.requests(),0);}finally{f.cleanup();}});

test('invalid quantity stays visible across background additions, cart reopen and product details',async()=>{
 const f=await fixture('quantity-edit-survives'),{w,$,click}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();
  let input=w.document.querySelector('[data-cart-action=quantity]');input.value='1.5';input.dispatchEvent(new w.Event('input'));
  assert.equal($('review-open').disabled,true);assert.equal($('cart-count').textContent,'1');
  click('.card-actions button','In den Warenkorb');input=w.document.querySelector('[data-cart-action=quantity]');
  assert.equal(input.value,'1.5');assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal($('review-open').disabled,true);assert.equal($('cart-count').textContent,'2');
  $('cart-open').click();$('cart-open').click();assert.equal(w.document.querySelector('[data-cart-action=quantity]').value,'1.5');
  click('#cart-content button','Details ansehen');$('detail-dialog').close();assert.equal($('review-open').disabled,true);
  input=w.document.querySelector('[data-cart-action=quantity]');input.value='3';input.dispatchEvent(new w.Event('input'));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.equal($('review-open').disabled,false);assert.equal($('cart-count').textContent,'3');assert.equal(w.document.querySelector('.quantity-error').textContent,'');
  assert.equal(JSON.parse(w.sessionStorage.getItem('bringness.shop.cart.v2'))['pos-online'],3);assert.equal(f.requests(),0);
 }finally{f.cleanup();}
});
test('invalid other cart row remains blocked when another row changes or is removed',async()=>{
 const f=await fixture('quantity-other-row'),{w,$}=f;try{
  const add=[...w.document.querySelectorAll('.card-actions button')].filter(b=>b.textContent==='In den Warenkorb');add[0].click();add[1].click();$('cart-open').click();
  const q=w.document.querySelector('[data-cart-product=pos-online][data-cart-action=quantity]');q.value='';q.dispatchEvent(new w.Event('input'));
  w.document.querySelector('[data-cart-product=pos-download][data-cart-action=plus]').click();assert.equal($('review-open').disabled,true);
  w.document.querySelector('[data-cart-product=pos-download][data-cart-action=remove]').click();assert.equal($('review-open').disabled,true);
  w.document.querySelector('[data-cart-product=pos-online][data-cart-action=plus]').click();assert.equal($('review-open').disabled,false);assert.equal($('cart-count').textContent,'2');
 }finally{f.cleanup();}
});
test('review commits a valid pending edit before showing totals and never sends a request',async()=>{
 const f=await fixture('quantity-review'),{w,$,click}=f;try{
  click('.card-actions button','In den Warenkorb');$('cart-open').click();const q=w.document.querySelector('[data-cart-action=quantity]');q.value='4';q.dispatchEvent(new w.Event('input'));$('review-open').click();
  assert.equal($('review-dialog').open,true);assert.match($('review-content').textContent,/4 × Bringness POS Online/);assert.match($('review-content').textContent,/166,55/);assert.equal($('cart-count').textContent,'4');assert.equal(f.requests(),0);
 }finally{f.cleanup();}
});
test('opening the shop does not overwrite corrupt or unavailable saved carts',async()=>{
 const f=await fixture('quantity-corrupt',{before:w=>w.sessionStorage.setItem('bringness.shop.cart.v2','{broken')}),{w,$,click}=f;try{
  assert.equal(w.sessionStorage.getItem('bringness.shop.cart.v2'),'{broken');assert.match($('storage-status').textContent,/nicht überschrieben/);assert.equal($('cart-count').textContent,'0');
  $('cart-open').click();assert.equal(w.sessionStorage.getItem('bringness.shop.cart.v2'),'{broken');click('.card-actions button','In den Warenkorb');assert.equal(JSON.parse(w.sessionStorage.getItem('bringness.shop.cart.v2'))['pos-online'],1);assert.equal($('storage-status').textContent,'');
 }finally{f.cleanup();}
});
test('detail next and previous skip personally hidden results but exact ad search can retrieve them',async()=>{
 const f=await fixture('hidden-detail-pagination'),{w,$,click}=f;try{
  w.document.querySelector('[aria-label="Bringness POS für Windows ausblenden"]').click();click('.card-actions button','Details ansehen');
  assert.match(w.document.querySelector('.product-pagination').textContent,/1 von 2/);click('.product-pagination button','Nächstes Produkt');assert.match($('detail-title').textContent,/AI/);$('detail-dialog').close();
  $('search').value='100002';$('search').dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('.card').length,1);click('.card-actions button','Details ansehen');assert.match($('detail-title').textContent,/Windows/);assert.equal(f.requests(),0);
 }finally{f.cleanup();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {browseProducts,cleanProductIds,readProductIds,writeProductIds} from '../../apps/web/public/shop/browse.js';

test('browse filters combine query, category, period and known prices',()=>{
 assert.deepEqual(browseProducts({query:'Windows',period:'once',priced:true}).map(p=>p.id),['pos-download']);
 assert.equal(browseProducts({category:'Hardware'}).length,0);
 assert.equal(browseProducts({period:'monthly'}).length,1);
 assert.deepEqual(browseProducts({period:'unknown'}).map(p=>p.id),['bringness-ai']);
 assert.equal(browseProducts({priced:true}).length,2);
 assert.equal(browseProducts({query:'<img src=x onerror=alert(1)>'}).length,0);
});
test('price sort keeps contract periods separate and does not price AI at zero',()=>{
 for(const sort of ['price-asc','price-desc'])assert.deepEqual(browseProducts({sort}).map(p=>p.id),['pos-online','pos-download','bringness-ai']);
 assert.equal(browseProducts({sort:'name'})[0].id,'bringness-ai');
});
test('saved/history storage accepts only catalog ids and survives blocked storage',()=>{
 assert.deepEqual(cleanProductIds(['pos-online','pos-online','foreign','__proto__',{},'bringness-ai']),['pos-online','bringness-ai']);
 assert.deepEqual(readProductIds({getItem:()=>'{broken'},'key'),[]);
 assert.deepEqual(readProductIds({getItem(){throw Error('blocked');}},'key'),[]);
 assert.equal(writeProductIds({setItem(){throw Error('blocked');}},'key',['pos-online']),false);
 let stored;assert.equal(writeProductIds({setItem(k,v){stored=v;}},'key',['pos-online',39900,'foreign']),true);assert.equal(stored,'["pos-online"]');
});

test('real shop browsing: synchronized categories, views, wishlist, comparison, history and cart',async()=>{
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
 const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://fixture.example.test/shop/',pretendToBeVisual:true}),w=dom.window,old={};
 for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
 let calls=0;globalThis.fetch=()=>{calls++;throw Error('unexpected API call');};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const $=id=>w.document.getElementById(id),change=id=>$(id).dispatchEvent(new w.Event('change'));
 const click=(selector,text)=>{const b=[...w.document.querySelectorAll(selector)].find(n=>n.textContent===text);assert.ok(b,text);b.click();};
 try{
  await import('../../apps/web/public/shop/shop.js?browse-tests');
  w.document.querySelector('[data-department="Hardware"]').click();assert.equal($('search-category').value,'Hardware');assert.match($('products').textContent,/noch nicht freigeschaltet/);
  $('search-category').value='Software';change('search-category');assert.equal(w.document.querySelector('[data-category="Software"]').getAttribute('aria-pressed'),'true');
  $('period-filter').value='monthly';change('period-filter');assert.equal(w.document.querySelectorAll('.card').length,1);
  $('reset-filters').click();assert.equal(w.document.querySelectorAll('.card').length,3);
  $('sort').value='price-desc';change('sort');assert.equal($('price-sort-note').hidden,false);
  $('view-list').click();assert.equal($('products').classList.contains('list-view'),true);assert.equal($('view-list').getAttribute('aria-pressed'),'true');
  $('view-grid').click();assert.equal($('products').classList.contains('list-view'),false);
  w.document.querySelector('[data-action="save"]').focus();click('.product-tools button','Merken');assert.equal(w.document.activeElement.dataset.action,'save');assert.equal(w.document.activeElement.getAttribute('aria-pressed'),'true');assert.equal($('saved-count').textContent,'1');$('saved-open').click();assert.equal($('saved-dialog').open,true);assert.match($('saved-content').textContent,/POS Online/);
  click('#saved-content button','Von Merkliste entfernen');assert.equal($('saved-count').textContent,'0');$('saved-dialog').close();
  for(let n=0;n<3;n++)click('.product-tools button','Vergleichen');assert.equal($('compare-count').textContent,'3');$('compare-open').click();assert.equal(w.document.querySelectorAll('.comparison-table thead th').length,4);assert.match($('compare-content').textContent,/Preis folgt/);assert.match($('compare-content').textContent,/Noch offen/);
  click('#compare-content button','Entfernen');assert.equal($('compare-count').textContent,'2');$('compare-dialog').close();
  click('.card-actions button','Details ansehen');assert.equal($('detail-dialog').open,true);assert.equal($('recent-products').children.length,1);$('detail-dialog').close();
  click('.card-actions button','Details ansehen');$('detail-dialog').close();assert.equal(JSON.parse(w.sessionStorage.getItem('bringness.shop.recent.v1')).length,1);
  $('recent-clear').click();assert.deepEqual(JSON.parse(w.sessionStorage.getItem('bringness.shop.recent.v1')),[]);
  click('.card-actions button','In den Warenkorb');assert.equal($('cart-feedback').hidden,false);assert.match($('cart-feedback-totals').textContent,/Monatlich/);$('cart-feedback-open').click();assert.equal($('cart-dialog').open,true);assert.equal($('cart-feedback').hidden,true);$('cart-dialog').close();
  $('search').value='<img src=x onerror=alert(1)>';$('search').dispatchEvent(new w.Event('input'));assert.equal($('active-filters').querySelector('img'),null);assert.match($('active-filters').textContent,/<img/);$('reset-filters').click();
  const submit=new w.Event('submit',{cancelable:true});$('search-form').dispatchEvent(submit);assert.equal(submit.defaultPrevented,true);
  assert.equal(calls,0);assert.ok([...w.document.querySelectorAll('#review-dialog button')].some(b=>b.disabled&&/Zahlung/.test(b.textContent)));
 }finally{for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();}
});

test('category and feature search are not cut off by long product descriptions',()=>{
 assert.equal(browseProducts({query:'Software'}).length,3);
 assert.deepEqual(browseProducts({query:'Cloud-TSE'}).map(p=>p.id),['pos-online']);
 assert.deepEqual(browseProducts({query:'Software',period:'once',minPrice:'399',maxPrice:'399'}).map(p=>p.id),['pos-download']);
});

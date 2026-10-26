import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {dependency} from './dependency.mjs';
import {readBrowseLocation,browseLocation,cartIssues,sessionStore} from '../../apps/web/public/shop/navigation.js';
import {filterProducts} from '../../apps/web/public/shop/catalog.js';

test('shareable catalog state is bounded, normalized and strips noncatalog parameters',()=>{
 const initial='https://fixture.example.test/shop/?token=secret&amount=1#token=private';
 const state={query:'POS Windows & Zubehör',category:'Software',period:'once',priced:true,sort:'name',view:'list',product:'pos-download'};
 const path=browseLocation(initial,state);assert.ok(!path.includes('secret'));assert.ok(!path.includes('private'));assert.ok(!path.includes('amount'));
 assert.deepEqual(readBrowseLocation(path),{...state,minPrice:'',maxPrice:'',city:''});
 const bad=readBrowseLocation('/shop/?q='+encodeURIComponent('x'.repeat(1000))+'&category=foreign&period=yearly&sort=evil&view=unknown&product=foreign&priced=yes');
 assert.equal(bad.query.length,150);assert.equal(bad.category,'Alle');assert.equal(bad.period,'all');assert.equal(bad.product,null);assert.equal(bad.priced,false);
 assert.equal(browseLocation('/shop/#angebote',{query:'',category:'foreign'}),'/shop/#angebote');
});
test('multiword search is insensitive to order and case',()=>{
 assert.deepEqual(filterProducts('Windows POS').map(p=>p.id),['pos-download']);
 assert.deepEqual(filterProducts('  ONLINE   bringness ').map(p=>p.id),['pos-online']);
 assert.equal(filterProducts('Windows AI').length,0);
});
test('cart eligibility explains multi-base and quantity conflict without changing cart',()=>{
 const cart={'pos-online':2,'pos-download':1},before=JSON.stringify(cart);
 assert.equal(cartIssues(cart).length,2);assert.equal(JSON.stringify(cart),before);
 assert.deepEqual(cartIssues({'pos-online':1}),[]);assert.deepEqual(cartIssues({}),[]);
 assert.throws(()=>cartIssues({'bringness-ai':1}));
});
test('session-storage getter failure has an explicit unavailable facade',()=>{
 const storage=sessionStore({get sessionStorage(){throw Error('blocked');}});
 for(const method of ['getItem','setItem','removeItem'])assert.throws(()=>storage[method]('key','value'),/STORAGE_UNAVAILABLE/);
});

async function domFixture(url,suffix,{blocked=false}={}){
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
 const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{url,pretendToBeVisual:true}),w=dom.window,old={};
 for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
 if(blocked)Object.defineProperty(w,'sessionStorage',{get(){throw Error('blocked');}});
 let calls=0;globalThis.fetch=()=>{calls++;throw Error('unexpected network');};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const $=id=>w.document.getElementById(id),click=(selector,text)=>{const b=[...w.document.querySelectorAll(selector)].find(b=>b.textContent===text);assert.ok(b,text);b.focus();b.click();return b;};
 const cleanup=()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();};
 try{await import('../../apps/web/public/shop/shop.js?'+suffix);}catch(e){cleanup();throw e;}
 return {w,$,click,calls:()=>calls,cleanup};
}

test('real DOM restores product link, filters and Back/Forward; details and saved cart actions remain local',async()=>{
 const f=await domFixture('https://fixture.example.test/shop/?q=Windows%20POS&period=once&view=list&product=pos-download','navigation');const {w,$,click}=f;
 try{
  assert.equal($('search').value,'Windows POS');assert.equal($('period-filter').value,'once');assert.equal($('products').classList.contains('list-view'),true);assert.equal(w.document.querySelectorAll('.card').length,1);assert.equal($('detail-dialog').open,true);assert.match($('detail-content').textContent,/474,81/);
  click('#detail-content button','Auf Merkliste');assert.equal($('saved-count').textContent,'1');$('detail-dialog').close();assert.equal(new URL(w.location.href).searchParams.has('product'),false);
  click('.card-actions button','Details ansehen');assert.equal(new URL(w.location.href).searchParams.get('product'),'pos-download');
  w.history.replaceState(null,'','/shop/?category=Hardware');w.dispatchEvent(new w.PopStateEvent('popstate'));assert.equal($('detail-dialog').open,false);assert.equal($('search-category').value,'Hardware');assert.match($('products').textContent,/noch nicht freigeschaltet/);
  click('#products button','Alle Angebote anzeigen');assert.equal(w.document.querySelectorAll('.card').length,3);
  const move=direction=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('history event timeout')),1000);w.addEventListener('popstate',()=>{clearTimeout(timer);resolve();},{once:true});w.history[direction]();});
  await move('back');assert.equal($('search-category').value,'Hardware');await move('forward');assert.equal($('search-category').value,'Alle');

  $('saved-open').click();click('#saved-content button','In den Warenkorb');assert.equal($('cart-dialog').open,true);assert.equal($('saved-dialog').open,false);assert.equal($('cart-count').textContent,'1');assert.equal($('review-open').disabled,false);$('cart-dialog').close();
  $('search').value='POS Online';$('search').dispatchEvent(new w.Event('input'));click('.card-actions button','In den Warenkorb');$('cart-open').click();assert.equal($('review-open').disabled,false);assert.match($('cart-issues').textContent,/nur eine Basislizenz/);
  click('#cart-content button','Entfernen');assert.equal($('review-open').disabled,false);assert.equal($('cart-issues').textContent,'');
  assert.equal($('search-suggestions').children.length,1);assert.equal(f.calls(),0);
 }finally{f.cleanup();}
});

test('real DOM keeps browsing, saved actions and cart usable with blocked storage',async()=>{
 const f=await domFixture('https://fixture.example.test/shop/','storage-blocked',{blocked:true});const {$,click,w}=f;
 try{
  assert.equal(w.document.querySelectorAll('.card').length,3);click('.product-tools button','Merken');assert.equal($('saved-count').textContent,'1');assert.match($('announcement').textContent,/Neuladen/);
  click('.card-actions button','In den Warenkorb');assert.equal($('cart-count').textContent,'1');$('cart-open').click();assert.match($('storage-status').textContent,/nicht speichern/);assert.equal($('review-open').disabled,false);assert.equal(f.calls(),0);
 }finally{f.cleanup();}
});

test('closing details returns focus after the product card was rebuilt by saving',async()=>{
 const f=await domFixture('https://fixture.example.test/shop/','dialog-focus');const {w,$,click}=f;
 try{click('.card-actions button','Details ansehen');click('#detail-content button','Auf Merkliste');$('detail-dialog').close();assert.equal(w.document.activeElement.dataset.action,'details');assert.equal(w.document.activeElement.dataset.product,'pos-online');}finally{f.cleanup();}
});

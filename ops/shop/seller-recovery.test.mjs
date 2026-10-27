import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {loadOffers,saveOffers,draftKey} from '../../apps/web/public/shop/offer-drafts.js';
import {validateOffer} from '../../apps/web/public/shop/offer-policy.js';
const id='offer-5ca5a12c-2000-4000-8000-2c87151e7788',other='offer-5ca5a12c-2000-4000-8000-2c87151e7789';
const offer=validateOffer({title:'Recovery fixture',category:'Baumarkt',kind:'physical',price:'12,50',tax:'19',stock:'2',gtin:'',condition:'new',sku:'',description:'Synthetic recovery test offer',delivery:'Synthetic delivery information',fulfilment:''});
const row={...offer,id};
for(const [label,raw] of [
 ['duplicate identifiers',JSON.stringify([row,row])],
 ['case-only duplicate identifiers',JSON.stringify([row,{...row,id:id.toUpperCase()}])],
 ['malformed UUID',JSON.stringify([{...row,id:'offer-'+'a'.repeat(36)}])],
 ['invalid UUID version',JSON.stringify([{...row,id:id.replace('-4000-','-0000-')}])],
 ['invalid UUID variant',JSON.stringify([{...row,id:id.replace('-8000-','-0000-')}])],
 ['broken JSON','{'],['wrong container','{}'],['null row','[null]'],
 ['invalid offer payload',JSON.stringify([{...row,price:'-1'}])]
])test('local draft read rejects '+label+' without altering stored data',()=>{let writes=0;const store={getItem:key=>{assert.equal(key,draftKey);return raw;},setItem(){writes++;}};assert.throws(()=>loadOffers(store));assert.equal(store.getItem(draftKey),raw);assert.equal(writes,0);});
test('local draft roundtrip retains distinct valid IDs and canonical values',()=>{let raw=null;const store={getItem:()=>raw,setItem:(key,v)=>{raw=v;}};saveOffers(store,[row,{...row,id:other}]);assert.deepEqual(loadOffers(store),[row,{...row,id:other}]);});
test('local draft writes refuse malformed and ambiguous identities before touching the store',()=>{let writes=0;const store={setItem(){writes++;}};for(const rows of [null,{},[{...row,id:'offer-'+'a'.repeat(36)}],[row,{...row,id:id.toUpperCase()}]])assert.throws(()=>saveOffers(store,rows));assert.equal(writes,0);});
const install=(values)=>{const saved=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const [k,value] of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,value});return ()=>{for(const[k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];};};
test('seller reads bind identity and exact historical revision, and reject malformed histories',async()=>{
 const map=new Map([['bringness-pos-token','synthetic-owner']]),storage={getItem:k=>map.get(k)??null};let reply;
 const restore=install({window:new EventTarget(),document:Object.assign(new EventTarget(),{hidden:false}),navigator:{onLine:true},localStorage:storage,sessionStorage:storage,fetch:async()=>Response.json(reply)});
 try{
  const client=await import('../../apps/web/public/shop/seller-account-client.js?recovery-policy');
  const value={id,revision:3,state:'draft',offer,canPublish:false};
  reply=value;assert.equal((await client.readSellerOffer(id)).id,id);
  for(const response of [{...value,id:other},{...value,sourceRevision:1},{...value,offer:{...offer,price:'-1'}}]){reply=response;await assert.rejects(()=>client.readSellerOffer(id),e=>e.code==='INVALID_RESPONSE');}
  for(const sourceRevision of [undefined,0,-1,1,2.5,4]){reply={...value,...(sourceRevision===undefined?{}:{sourceRevision})};await assert.rejects(()=>client.readSellerOffer(id,2),e=>e.code==='INVALID_RESPONSE');}
  reply={...value,sourceRevision:2};assert.equal((await client.readSellerOffer(id,2)).sourceRevision,2);
  const version={revision:3,action:'save',state:'draft',createdAt:'2026-10-27T00:00:00Z'};
  for(const versions of [[null],[version,version],[{...version,revision:1},version],[{...version,action:'archive'}],[{...version,state:'archived'}]]){reply={id,versions,canPublish:false};await assert.rejects(()=>client.readSellerHistory(id),e=>e.code==='INVALID_RESPONSE');}
  reply={id,versions:[version,{...version,revision:2,action:'restore'},{...version,revision:1,action:'archive',state:'archived'}],canPublish:false};assert.equal((await client.readSellerHistory(id)).versions.length,3);
 }finally{restore();}
});
const waitFor=async predicate=>{const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw Error('Seller recovery UI did not settle');await new Promise(resolve=>setTimeout(resolve,10));}};
test('lost first-save replay retains newer edits and requires explicit reload before another account save',async()=>{
 const {JSDOM}=createRequire(import.meta.url)(dependency('jsdom','SHOP_JSDOM_PATH'));
 const w=new JSDOM(await readFile(new URL('../../apps/web/public/shop/seller.html',import.meta.url),'utf8'),{url:'https://fixture.test/shop/seller.html',pretendToBeVisual:true}).window;
 let mode='lost',writes=[],confirmed=null;
 const restore=install(Object.fromEntries(['window','document','location','sessionStorage','localStorage','navigator','FormData','Event'].map(k=>[k,k==='window'?w:w[k]])));
 const restoreFetch=install({fetch:async(url,options)=>{if(options.method==='POST'){const command=JSON.parse(options.body);writes.push(command);confirmed={id:command.id,revision:1,state:'draft',offer:command.offer,canPublish:false};if(mode==='lost')throw Error('Synthetic lost reply');return Response.json(confirmed);}return Response.json(confirmed);}});
 try{
  w.localStorage.setItem('bringness-pos-token','synthetic-owner');w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};
  await import('../../apps/web/public/shop/seller-page.js?recovery-dom');
  const $=id=>w.document.getElementById(id),form=$('offer-form');for(const [key,value]of Object.entries(offer))if(form.elements[key])form.elements[key].value=value;
  form.dispatchEvent(new w.Event('input',{bubbles:true}));$('cloud-editor-save').click();await waitFor(()=>!$('cloud-editor-save').disabled&&!$('cloud-editor-retry').hidden);
  assert.equal(writes.length,1);form.elements.title.value='Newer unsaved edit';form.dispatchEvent(new w.Event('input',{bubbles:true}));mode='ok';$('cloud-editor-retry').click();await waitFor(()=>$('cloud-editor-status').textContent.includes('Ursprüngliche Anfrage bestätigt'));
  await waitFor(()=>$('cloud-editor-retry').hidden);assert.equal($('cloud-editor-save').disabled,true);assert.equal(form.elements.title.value,'Newer unsaved edit');assert.equal($('cloud-offer-id').value,confirmed.id);assert.deepEqual(writes[0],writes[1]);
  $('cloud-editor-save').onclick();assert.equal(writes.length,2,'No new ID or revision may be submitted after replay');
  $('cloud-editor-load').click();await waitFor(()=>!$('cloud-editor-save').disabled);assert.equal(form.elements.title.value,offer.title);
  w.dispatchEvent(new w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(form.elements.title.value,'');assert.equal($('preview-content').textContent,'');
  for(const [key,value]of Object.entries(offer))if(form.elements[key])form.elements[key].value=value;
  form.dispatchEvent(new w.Event('input',{bubbles:true}));$('cloud-editor-save').click();
  w.dispatchEvent(new w.Event('pagehide'));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(writes.length,2,'A save invalidated during its identity check must never reach transport');
 }finally{restoreFetch();restore();w.close();}
});

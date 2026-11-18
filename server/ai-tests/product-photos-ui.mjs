import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../../apps/web/public/pos/product-photos.js',import.meta.url),'utf8'),helper=await readFile(new URL('../../apps/web/public/product-photo.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const pause=()=>new Promise(r=>setTimeout(r,5)),until=async check=>{const end=Date.now()+4000;while(!check()){if(Date.now()>end)throw Error('Photo UI condition timed out');await pause();}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture({intercept=()=>null,prepare=async()=>png,query=''}={}){
 const d=new JSDOM('<!doctype html><meta charset="utf-8"><select id="restaurant"><option value="'+rid+'">Own</option><option value="'+other+'">Other</option></select><div id="products"></div><form id="productForm"><input id="productEmoji" value="🍽️"><button>Produkt hinzufügen</button></form>',{url:'https://photo.test/pos/'+query,runScripts:'outside-only'}),w=d.window;
 w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};w.localStorage.setItem('bringness-pos-token','owner');w.eval(helper);w.BringnessProductPhoto.prepare=prepare;
 let stored=null,version='a'.repeat(64),failAfterSave=false;const requests=[],saved=[],created=[];
 w.fetch=async(path,options={})=>{
  requests.push({path,options});const intercepted=intercept(path,options,{w});if(intercepted)return intercepted;
  if(options.method==='PUT'){
   const b=JSON.parse(options.body);assert.deepEqual(Object.keys(b).sort(),['expectedVersion','image','restaurantId']);
   if(b.expectedVersion!==version&&b.image!==stored)return {ok:false,status:409,json:async()=>({error:'Inzwischen geändert. Bitte neu laden.'})};stored=b.image;version='b'.repeat(64);
   if(failAfterSave){failAfterSave=false;throw Error('Synthetic lost reply');}
  }
  return {ok:true,status:200,json:async()=>({id,restaurantId:rid,image:stored,version})};
 };
 w.document.getElementById('productForm').onsubmit=async e=>{e.preventDefault();created.push(w.bnProductPhotos?.newImage());w.bnProductPhotos?.created();};w.eval(source);
 w.bnProductPhotos?.connect({context:()=>({session:'owner',restaurantId:w.document.getElementById('restaurant').value}),product:()=>({id,name:'Safe <article>',price:12.99}),saved:(...args)=>saved.push(args)});
 const select=(input,name='photo.jpg')=>{Object.defineProperty(input,'files',{configurable:true,value:[new w.File(['synthetic'],name,{type:'image/jpeg'})]});input.dispatchEvent(new w.Event('change'));};
 return {w,$:selector=>w.document.querySelector(selector),requests,saved,created,select,setLostReply:()=>failAfterSave=true,close:()=>w.close()};
}
const f=await fixture();try{
 f.select(f.$('#productPhotoFile'));await until(()=>!f.$('#productPhotoPreview').hidden);assert.equal(f.$('#productEmoji').value,'🍽️','image bytes never enter the visible emoji field');assert.equal(f.requests.length,0,'preview is local');
 f.$('#productForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await until(()=>f.created.length===1);assert.equal(f.created[0],png);assert.equal(f.$('#productPhotoPreview').hidden,true);
 await f.w.bnProductPhotos.open(id);assert.equal(f.$('dialog h3').textContent,'Safe <article> · Artikelfoto');assert.equal(f.$('dialog h3 article'),null);
 f.select(f.$('dialog input'));await until(()=>!f.$('dialog [data-save]').disabled);f.setLostReply();f.$('dialog [data-save]').click();await until(()=>f.$('dialog [role=status]').textContent.includes('Speicherstatus unklar'));
 const original=f.requests.filter(r=>r.options.method==='PUT')[0].options.body;assert.equal(f.$('dialog input').disabled,true);f.$('dialog [data-save]').click();await until(()=>f.saved.length===1);assert.equal(f.requests.filter(r=>r.options.method==='PUT')[1].options.body,original);assert.equal(f.saved[0][1],png);
 f.$('dialog [data-remove]').click();assert.equal(f.requests.filter(r=>r.options.method==='PUT').length,2,'remove requires explicit save');f.$('dialog [data-save]').click();await until(()=>f.saved.length===2);assert.equal(f.saved[1][1],null);
}finally{f.close();}
const broken=await fixture({intercept:()=>({ok:true,status:200,json:async()=>({id,restaurantId:rid,image:'/api/v1/product-images/missing',version:'a'.repeat(64)})})});try{await broken.w.bnProductPhotos.open(id);broken.$('dialog img').dispatchEvent(new broken.w.Event('error'));assert.equal(broken.$('dialog img').hidden,true);assert.match(broken.$('dialog [data-empty]').textContent,/Originalfoto erneut auswählen/);assert.equal(broken.$('dialog input').disabled,false);assert.equal(broken.requests.filter(r=>r.options.method==='PUT').length,0);}finally{broken.close();}
for(const phase of ['new-photo','load','prepare','save']){
 const pending=deferred();let started=false;
 const f=await fixture({prepare:phase==='prepare'||phase==='new-photo'?()=>{started=true;return pending.promise;}:async()=>png,intercept:(path,o)=>{
  if(phase==='load'&&!o.method||phase==='save'&&o.method==='PUT'){started=true;return pending.promise;}return null;
 }});
 try{
  if(phase==='new-photo')f.select(f.$('#productPhotoFile'));
  else{const opened=f.w.bnProductPhotos.open(id);if(phase!=='load'){await opened;f.select(f.$('dialog input'));if(phase==='save'){await until(()=>!f.$('dialog [data-save]').disabled);f.$('dialog [data-save]').click();}}}
  await until(()=>started);f.$('#restaurant').value=other;f.$('#restaurant').dispatchEvent(new f.w.Event('change'));
  pending.resolve(phase==='new-photo'||phase==='prepare'?png:{ok:true,status:200,json:async()=>({id,restaurantId:rid,image:png,version:'c'.repeat(64)})});await pause();await pause();assert.equal(f.$('dialog'),null);assert.equal(f.saved.length,0);assert.equal(f.$('#productPhotoPreview').hidden,true);assert.equal(f.w.bnProductPhotos.newImage(),null);
 }finally{f.close();}
}
for(const query of ['?desktop=1','?edition=download']){const f=await fixture({query});try{assert.equal(f.w.bnProductPhotos,undefined);assert.equal(f.$('#productPhotoFile'),null);}finally{f.close();}}
const helperDom=new JSDOM('',{runScripts:'outside-only'});helperDom.window.eval(helper);assert.equal(helperDom.window.BringnessProductPhoto.source('data:image/svg+xml;base64,PHN2Zz4='),null);assert.equal(helperDom.window.BringnessProductPhoto.source('javascript:alert(1)'),null);helperDom.window.close();
console.log('Article photo UI passed: local preview, no raw image text, explicit save/removal, lost-reply retry with identical payload, late load/prepare/save rejection after business switch, safe text rendering and frozen desktop entry.');

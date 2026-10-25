import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {shopStatuses,setShopStatus,clearShopStatus,draftStatusKey} from '../../apps/web/public/shop/status-view.js';
import {checkoutStatuses} from '../../apps/web/public/shop/checkout-state.js';

test('agreed status meanings are fixed and every checkout phase has a mapping',()=>{
 assert.deepEqual(['draft','quote','expired','failed','completed'].map(key=>shopStatuses[key].tone),['neutral','info','warning','error','success']);
 for(const key of Object.keys(checkoutStatuses))assert.ok(Object.hasOwn(shopStatuses,key),`Map new checkout status ${key} explicitly`);
 assert.equal(shopStatuses.paid.label,checkoutStatuses.paid.title);assert.notEqual(shopStatuses.paid.label,shopStatuses.completed.label);
 assert.equal(Object.isFrozen(shopStatuses),true);assert.ok(Object.values(shopStatuses).every(Object.isFrozen));
});
test('status transitions replace stale colours and preserve literal status text',()=>{
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),dom=new JSDOM('<p role="status"></p>');
 try{
  const e=dom.window.document.querySelector('p');setShopStatus(e,'completed');assert.equal(e.dataset.tone,'success');
  setShopStatus(e,'expired','Preis abgelaufen');assert.equal(e.dataset.tone,'warning');assert.equal(e.textContent,'Preis abgelaufen');
  setShopStatus(e,'failed','<img src=x onerror=alert(1)>');assert.equal(e.children.length,0);assert.equal(e.dataset.tone,'error');
  for(const key of ['__proto__','constructor','new-unmapped-state',null]){setShopStatus(e,key,'Abgeschlossen');assert.equal(e.dataset.shopStatus,'unknown');assert.equal(e.dataset.tone,'warning');assert.match(e.textContent,/Unbekannter Status/);}
  clearShopStatus(e);assert.equal(e.textContent,'');assert.equal(e.dataset.tone,undefined);assert.equal(e.classList.contains('shop-status'),false);assert.equal(e.getAttribute('role'),'status');
 }finally{dom.window.close();}
});
test('draft expiry and cancellation never become a completed purchase',()=>{
 const now=Date.parse('2026-10-24T14:00:00Z'),d={status:'draft',expired:false,expiresAt:'2026-10-24T14:01:00Z'};
 assert.equal(draftStatusKey(d,now),'draft');assert.equal(draftStatusKey(d,now+60000),'expired');
 assert.equal(draftStatusKey({...d,expired:true},now),'expired');assert.equal(draftStatusKey({...d,status:'canceled',expired:true},now),'canceled');
 assert.equal(draftStatusKey({...d,status:'paid'},now),'unknown');assert.equal(draftStatusKey({...d,expiresAt:'broken'},now),'unknown');
});
test('all status text pairs exceed 4.5 contrast; print remains legible without colour',async()=>{
 const css=await readFile(new URL('../../apps/web/public/shop/status-colors.css',import.meta.url),'utf8');
 const luminance=hex=>{const v=hex.match(/[a-f0-9]{2}/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
 for(const tone of new Set(Object.values(shopStatuses).map(x=>x.tone))){
  const value=part=>{const m=css.match(new RegExp(`--shop-${tone}-${part}:#([a-f0-9]{6})`));assert.ok(m,`${tone} ${part}`);return luminance(m[1]);};
  const a=value('text'),b=value('bg');assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${tone} text contrast`);
 }
 assert.match(css,/@media print[\s\S]*color:#000!important;background:#fff!important;border-color:#000!important/);
 assert.match(css,/@media \(forced-colors:active\)/);
 const html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8');assert.match(html,/href="\.\/status-colors.css"/);
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),html=await readFile(new URL('../../apps/web/public/shop/index.html',import.meta.url),'utf8');
test('fixed login continuation restores review and cart without any automatic account or payment request',async()=>{
 for(const [hash,open] of [['#review',true],['#next=https://evil.test',false]]){
  const dom=new JSDOM(html,{url:'https://fixture.test/shop/'+hash,pretendToBeVisual:true}),w=dom.window,old={};for(const k of ['document','window','sessionStorage','localStorage','fetch']){old[k]=globalThis[k];globalThis[k]=w[k];}
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not request automatically');};w.sessionStorage.setItem('bringness.shop.cart.v2','{"pos-online":1}');
  try{await import('../../apps/web/public/shop/shop.js?account-return='+encodeURIComponent(hash));assert.equal(w.document.getElementById('review-dialog').open,open);assert.equal(w.document.getElementById('cart-count').textContent,'1');assert.equal(w.sessionStorage.getItem('bringness.shop.cart.v2'),'{"pos-online":1}');assert.equal(calls,0);if(open){assert.match(w.document.getElementById('account-status').textContent,/erneut prüfen/);assert.equal(w.document.getElementById('draft-controls').hidden,true);}}
  finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();}
 }
});

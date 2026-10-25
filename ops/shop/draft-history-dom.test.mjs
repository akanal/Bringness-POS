import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
import {mountDraftHistory,validDraftHistory} from '../../apps/web/public/shop/draft-history.js';
function item(){return {id:crypto.randomUUID(),status:'draft',expired:false,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),productId:'pos-online',planCode:'pos_base_monthly',period:'monthly',currency:'EUR',netCents:2999,vatCents:570,grossCents:3569};}
const page=(items=[],nextCursor=null,scope='a'.repeat(64))=>({version:1,scope,items,nextCursor,canPay:false,canActivate:false,checkoutConnected:false});
test('history browser validation rejects unsafe, duplicated and nonprogressing pages',()=>{
 const row=item();assert.equal(validDraftHistory(page([row])),true);
 for(const value of [{...page([row]),canPay:true},{...page([row]),scope:'foreign'},page([row,row]),page([{...row,productId:'bringness-ai'}]),page([{...row,grossCents:1}]),page([],'abc'),page(Array.from({length:11},item))])assert.equal(validDraftHistory(value),false);
});
function fixture(request){
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),dom=new JSDOM('<dialog open><div id="host"></div></dialog>',{url:'https://fixture.example.test/shop/'}),w=dom.window,old={};for(const k of ['window','document']){old[k]=globalThis[k];globalThis[k]=w[k];}
 let session='owner-a',opened;const dialog=w.document.querySelector('dialog'),host=w.document.getElementById('host'),calls=[];
 const controller=mountDraftHistory({dialog,host,token:()=>session,request:async(path,options)=>{calls.push({path,options});return request(path,options);},onOpenDraft:(...args)=>{opened=args;}});
 return {w,host,dialog,controller,calls,changeSession:value=>{session=value;},opened:()=>opened,cleanup(){controller.clear();for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();}};
}
test('history appends pages, opens a stored identity and clears when closed',async()=>{
 const first=item(),second={...item(),status:'canceled'},f=fixture(async path=>path.includes('?')?page([second]):page([first],'cGFnZTI'));try{
  await f.controller.open();assert.equal(f.host.querySelectorAll('.history-entry').length,1);f.host.lastElementChild.click();await new Promise(r=>setTimeout(r,10));assert.equal(f.host.querySelectorAll('.history-entry').length,2);assert.deepEqual([...f.host.querySelectorAll('.history-phase')].map(e=>e.dataset.shopStatus),['draft','canceled']);assert.match(f.calls[1].path,/\?cursor=cGFnZTI/);assert.equal(f.host.lastElementChild.hidden,true);
  f.host.querySelector('.history-entry button').click();assert.deepEqual(f.opened(),[first.id,'owner-a']);f.dialog.dispatchEvent(new f.w.Event('close'));assert.equal(f.host.querySelectorAll('.history-entry').length,0);assert.equal(f.host.getAttribute('aria-busy'),'false');
 }finally{f.cleanup();}
});
test('history discards a late old-account response without a storage event',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));try{const pending=f.controller.open();f.changeSession('owner-b');resolve(page([item()]));await pending;assert.equal(f.host.querySelectorAll('.history-entry').length,0);assert.match(f.host.textContent,/Konto hat gewechselt/);}finally{f.cleanup();}
});
test('history failures retain loaded entries while scope changes clear them',async()=>{
 let n=0;const f=fixture(async()=>{n++;if(n===1)return page([item()],'cGFnZTI');if(n===2)throw Error('network failure');return page([item()],null,'b'.repeat(64));});try{
  await f.controller.open();f.host.lastElementChild.click();await new Promise(r=>setTimeout(r,10));assert.equal(f.host.querySelectorAll('.history-entry').length,1);assert.match(f.host.textContent,/bleiben erhalten/);f.host.lastElementChild.click();await new Promise(r=>setTimeout(r,10));assert.equal(f.host.querySelectorAll('.history-entry').length,0);assert.match(f.host.textContent,/Betrieb hat gewechselt/);
 }finally{f.cleanup();}
 for(const code of ['UNAUTHORIZED','FORBIDDEN']){let reads=0;const denied=fixture(async()=>{if(++reads===1)return page([item()],'cGFnZTI');throw Error(code);});try{await denied.controller.open();denied.host.lastElementChild.click();await new Promise(r=>setTimeout(r,10));assert.equal(denied.host.querySelectorAll('.history-entry').length,0);}finally{denied.cleanup();}}
});
test('closing loading history aborts it and prevents later data from returning',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));try{const pending=f.controller.open();f.dialog.open=false;f.dialog.dispatchEvent(new f.w.Event('close'));assert.equal(f.calls[0].options.signal.aborted,true);resolve(page([item()]));await pending;assert.equal(f.host.querySelectorAll('.history-entry').length,0);}finally{f.cleanup();}
});
test('history handles no account, offline and empty results without automatic retry',async()=>{
 const f=fixture(async()=>page([]));try{f.changeSession('');await f.controller.open();assert.equal(f.calls.length,0);assert.match(f.host.textContent,/anmelden/);f.changeSession('owner-a');Object.defineProperty(f.w.navigator,'onLine',{value:false,configurable:true});await f.controller.open();assert.equal(f.calls.length,0);Object.defineProperty(f.w.navigator,'onLine',{value:true,configurable:true});f.w.dispatchEvent(new f.w.Event('online'));assert.equal(f.calls.length,0);await f.controller.open();assert.match(f.host.textContent,/Noch keine gespeicherten/);}finally{f.cleanup();}
});

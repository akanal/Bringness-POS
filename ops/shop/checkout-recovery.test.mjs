import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
import {shopStatuses} from '../../apps/web/public/shop/status-view.js';
import {checkoutStatuses,validCheckoutReference,draftCanPrepare} from '../../apps/web/public/shop/checkout-state.js';
import {mountCheckout,validCheckout} from '../../apps/web/public/shop/checkout-flow.js';
const hash='a'.repeat(64);
function records(){const line={productId:'pos-download',planCode:'download_license',quantity:1,period:'once',netCents:39900,vatCents:7581,grossCents:47481};const draft={id:crypto.randomUUID(),requestId:crypto.randomUUID(),status:'draft',expired:false,expiresAt:new Date(Date.now()+300000).toISOString(),snapshot:{currency:'EUR',lines:[line]}};return {draft,order:{version:1,id:crypto.randomUUID(),requestId:crypto.randomUUID(),draftId:draft.id,status:'prepared',snapshot:{...line,currency:'EUR'},canPay:false,canActivate:false,checkoutConnected:false}};}
test('checkout proof validates safe amounts, product identity and disabled payment gates',()=>{
 const {draft,order}=records();assert.equal(validCheckout(order,draft),true);
 for(const patch of [{canPay:true},{canActivate:true},{checkoutConnected:true},{status:'activated'},{id:'foreign'},{draftId:crypto.randomUUID()},{snapshot:{...order.snapshot,grossCents:1}}])assert.equal(validCheckout({...order,...patch},draft),false);
 const bad={...draft,snapshot:{lines:[{...draft.snapshot.lines[0],netCents:39899,vatCents:7582}]}};assert.equal(validCheckout({...order,snapshot:{...order.snapshot,netCents:39899,vatCents:7582}},bad),false);
});
test('checkout references require exact version, identity and session hash',()=>{
 const ref={version:1,requestId:crypto.randomUUID(),sessionHash:hash};assert.equal(validCheckoutReference(ref,hash),ref);
 for(const value of [null,[],{...ref,version:2},{...ref,extra:1},{...ref,requestId:'invalid'},{...ref,sessionHash:'x'}])assert.throws(()=>validCheckoutReference(value,hash),/INVALID_CHECKOUT_REFERENCE/);
 assert.throws(()=>validCheckoutReference(ref,'b'.repeat(64)),/ACCOUNT_CHANGED/);
 assert.equal(draftCanPrepare({status:'draft',expired:false,expiresAt:'invalid'}),false);assert.equal(draftCanPrepare({status:'canceled',expired:false,expiresAt:'2099-01-01'}),false);
});
async function fixture({state='prepared',request:custom,before}={}){
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
 const dom=new JSDOM('<div id="host"></div>',{url:'https://fixture.example.test/shop/'}),w=dom.window,old={};for(const k of ['window','document']){old[k]=globalThis[k];globalThis[k]=w[k];}
 const {draft,order}=records();order.status=state;const calls=[],errors=[];let pending,abandoned,expiry;
 const native=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>{if(ms>60000){expiry=fn;return 12345;}return native(fn,ms,...args);};before?.({w,draft,order});
 const host=w.document.getElementById('host'),ctx={session:'fixture',current:()=>true};
 const request=async(path,options={})=>{calls.push({path,options});if(custom)return custom(path,options,{draft,order,w});if(options.method==='POST')return {...order,status:'canceled'};if(path===`drafts/${draft.id}`)return {...draft,status:'canceled'};return order;};
 mountCheckout({draft,host,run:fn=>{pending=Promise.resolve().then(()=>fn(ctx)).catch(e=>errors.push(e));},request,fingerprint:async()=>hash,money:n=>(n/100).toFixed(2),onAbandoned:d=>{abandoned=d;}});
 const $=id=>w.document.getElementById(id),click=text=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();};
 return {w,host,draft,order,calls,errors,$,click,settle:()=>pending,expire:()=>expiry(),abandoned:()=>abandoned,cleanup(){for(const[k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}w.close();}};
}
test('each stored checkout state has distinct text and blocks a new preparation',async t=>{
 for(const state of Object.keys(checkoutStatuses))await t.test(state,async()=>{const f=await fixture({state});try{f.$('checkout-refresh').click();await f.settle();assert.match(f.$('checkout-result').textContent,new RegExp(checkoutStatuses[state].title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(f.$('checkout-result').firstElementChild.dataset.shopStatus,state);assert.equal(f.$('checkout-result').firstElementChild.dataset.tone,shopStatuses[state].tone);assert.equal(f.$('checkout-prepare').disabled,true);assert.equal(f.$('checkout-prepare').dataset.locked,'true');assert.match(f.$('checkout-result').textContent,/19 % MwSt./);assert.equal(f.host.querySelector('input[aria-label="Vorgangsnummer"]').value,f.order.id);assert.equal(f.host.querySelectorAll('.checkout-confirmation').length,state==='prepared'?1:0);assert.ok(f.calls.every(c=>!c.options.method));}finally{f.cleanup();}});
});
test('bad local checkout references never cause POST or get erased',async t=>{
 for(const raw of ['broken JSON','null','[]',JSON.stringify({version:2,requestId:crypto.randomUUID(),sessionHash:hash})])await t.test(raw,async()=>{const f=await fixture({before:({w,draft})=>w.sessionStorage.setItem(`bringness.shop.checkout.v2:${draft.id}`,raw),request:async()=>{throw Error('CHECKOUT_NOT_FOUND');}});try{f.$('checkout-prepare').click();await f.settle();assert.equal(f.errors[0].message,'INVALID_CHECKOUT_REFERENCE');assert.equal(f.calls.length,1);assert.equal(f.w.sessionStorage.getItem(`bringness.shop.checkout.v2:${f.draft.id}`),raw);assert.match(f.$('checkout-result').textContent,/Anfragereferenzen bleiben erhalten/);}finally{f.cleanup();}});
});
test('lost preparation reply recovers same record with GET, without another POST',async()=>{
 let stored,posts=0;const f=await fixture({request:async(path,options,{order})=>{if(options.method==='POST'){posts++;stored={...order,requestId:options.body.requestId};throw Error('lost reply');}if(stored)return stored;throw Error('CHECKOUT_NOT_FOUND');}});try{
  f.$('checkout-prepare').click();await f.settle();assert.equal(posts,1);const ref=f.w.sessionStorage.getItem(`bringness.shop.checkout.v2:${f.draft.id}`);assert.ok(ref);f.$('checkout-refresh').click();await f.settle();assert.equal(posts,1);assert.match(f.$('checkout-result').textContent,/Vorbereitung gespeichert/);assert.equal(f.w.sessionStorage.getItem(`bringness.shop.checkout.v2:${f.draft.id}`),ref);
 }finally{f.cleanup();}
});
test('cancellation confirmation is reusable; Behalten makes no request',async()=>{
 const f=await fixture();try{f.$('checkout-refresh').click();await f.settle();f.click('Vorbereitung verwerfen');f.click('Vorbereitung verwerfen');assert.equal(f.host.querySelectorAll('.checkout-confirmation').length,1);f.click('Behalten');assert.equal(f.host.querySelector('.checkout-confirmation').hidden,true);assert.equal(f.calls.length,1);f.click('Vorbereitung verwerfen');f.click('Verwerfen bestätigen');await f.settle();assert.equal(f.abandoned().status,'canceled');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);}finally{f.cleanup();}
});
test('foreign draft after cancellation is rejected before calling abandonment callback',async()=>{
 const f=await fixture({request:async(path,options,{order,draft})=>options.method==='POST'?{...order,status:'canceled'}:path.startsWith('drafts/')?{...draft,id:crypto.randomUUID(),status:'canceled'}:order});try{f.$('checkout-refresh').click();await f.settle();f.click('Vorbereitung verwerfen');f.click('Verwerfen bestätigen');await f.settle();assert.equal(f.errors[0].message,'INVALID_RESPONSE');assert.equal(f.abandoned(),undefined);}finally{f.cleanup();}
});
test('draft deadline disables creation while preserving read-only recovery',async()=>{
 const f=await fixture();try{f.expire();assert.equal(f.$('checkout-prepare').disabled,true);assert.equal(f.$('checkout-refresh').disabled,false);assert.match(f.$('checkout-expiry').textContent,/abgelaufen/);f.$('checkout-refresh').click();await f.settle();assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,undefined);}finally{f.cleanup();}
});

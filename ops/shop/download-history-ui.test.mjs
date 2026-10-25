import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {mountDownloadHistory} from '../../apps/web/public/shop/download-history-ui.js';
import {validDownloadHistory,readDownloadHistory} from '../../apps/web/public/shop/download-history-client.js';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const item=(status='prepared')=>({id:crypto.randomUUID(),status,createdAt:new Date().toISOString(),productId:'pos-download',planCode:'download_license',period:'once',currency:'EUR',netCents:39900,vatCents:7581,grossCents:47481,paymentMode:'test',licence:'blocked',purchaseCompleted:false});
const page=(items=[item()],more=null,status='all',scope='a'.repeat(64))=>({version:1,scope,status,checkedAt:new Date().toISOString(),items,nextCursor:more,canPay:false,canActivate:false,checkoutConnected:false});
async function waitFor(fn){const end=Date.now()+3000;while(!fn()){assert.ok(Date.now()<end,'history UI timed out');await new Promise(r=>setTimeout(r,5));}}
function setup(request=async()=>page()){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://fixture.example.test/shop/download-history.html'}),w=dom.window,host=w.document.getElementById('host'),calls=[];let token='owner-a';
 const ui=mountDownloadHistory({host,getToken:()=>token,request:options=>{calls.push(options);return request(options);}}),click=text=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();};
 return {w,host,ui,calls,click,setToken:value=>token=value,settle:()=>waitFor(()=>ui.root.getAttribute('aria-busy')==='false'),cleanup(){ui.dispose();w.close();}};
}
test('history validates identities, original VAT, fixed release gates and filtered contents',()=>{
 const p=page([item('paid')]);assert.equal(validDownloadHistory(p),true);
 for(const patch of [{canPay:true},{nextCursor:'?'},{items:[p.items[0],p.items[0]]},{items:[{...p.items[0],grossCents:1}]},{items:[{...p.items[0],licence:'active'}]},{status:'prepared'},{scope:'bad'},{checkedAt:'bad'}])assert.equal(validDownloadHistory({...p,...patch}),false);
 assert.equal(validDownloadHistory(page([],null)),true);assert.equal(validDownloadHistory(page([],'cGFnZTI')),false);
});
test('mount is idle; explicit read renders recorded status and the exact review reference',async()=>{
 const row=item('paid'),f=setup(async()=>page([row]));try{
  assert.equal(f.calls.length,0);f.click('Verlauf neu laden');await f.settle();assert.equal(f.calls.length,1);assert.match(f.host.textContent,/Lizenz weiterhin gesperrt/);assert.match(f.host.textContent,/399,00/);assert.match(f.host.textContent,/75,81/);assert.match(f.host.textContent,/474,81/);
  assert.equal(f.host.querySelector('.history-entry a').getAttribute('href'),'/shop/download-review.html#checkout='+row.id);assert.equal(f.host.querySelector('[data-shop-status=completed]'),null);assert.equal(f.host.querySelectorAll('input').length,0);
 }finally{f.cleanup();}
});
test('page failure preserves prior items and cursor; duplicate replies never duplicate cards',async()=>{
 const first=item(),second=item();let n=0;const f=setup(async()=>{n++;if(n===1)return page([first],'cGFnZTI');if(n===2)throw Error('private diagnostic');if(n===3)return page([first]);return page([second]);});try{
  f.click('Verlauf neu laden');await f.settle();f.click('Weitere Vorgänge laden');await f.settle();assert.equal(f.host.querySelectorAll('.history-entry').length,1);assert.match(f.host.textContent,/Bereits geladene Einträge bleiben erhalten/);assert.equal(f.host.textContent.includes('private'),false);
  f.click('Weitere Vorgänge laden');await f.settle();assert.equal(f.host.querySelectorAll('.history-entry').length,1);f.click('Weitere Vorgänge laden');await f.settle();assert.equal(f.host.querySelectorAll('.history-entry').length,2);assert.ok(f.calls.slice(1).every(c=>c.cursor==='cGFnZTI'));
 }finally{f.cleanup();}
});
test('filter change resets pagination and does not mix scopes or status sets',async()=>{
 let changed=false;const f=setup(async q=>page([item(q.status==='all'?'prepared':q.status)],changed?null:'cGFnZTI',q.status,changed?'b'.repeat(64):'a'.repeat(64)));try{
  f.click('Verlauf neu laden');await f.settle();const select=f.host.querySelector('select');changed=true;select.value='paid';select.dispatchEvent(new f.w.Event('change'));await f.settle();assert.equal(f.calls[1].cursor,null);assert.equal(f.calls[1].status,'paid');assert.equal(f.host.querySelectorAll('.history-entry').length,1);assert.equal(f.host.querySelector('.history-entry .shop-status').dataset.shopStatus,'paid');
 }finally{f.cleanup();}
});
test('unexpected company scope and revoked session remove all previously loaded entries',async()=>{
 let n=0;const f=setup(async()=>++n===1?page([item()],'cGFnZTI'):page([item()],null,'all','b'.repeat(64)));try{f.click('Verlauf neu laden');await f.settle();f.click('Weitere Vorgänge laden');await f.settle();assert.equal(f.host.querySelectorAll('.history-entry').length,0);assert.match(f.host.textContent,/Betrieb hat gewechselt/);}finally{f.cleanup();}
 let first=true;const g=setup(async()=>{if(first){first=false;return page([item()],'cGFnZTI');}throw Object.assign(Error('private'),{code:'UNAUTHORIZED'});});try{g.click('Verlauf neu laden');await g.settle();g.click('Weitere Vorgänge laden');await g.settle();assert.equal(g.host.querySelectorAll('.history-entry').length,0);assert.match(g.host.textContent,/Zugang ist abgelaufen/);}finally{g.cleanup();}
});
test('late responses, hidden page and account switch cannot restore private records',async()=>{
 let resolve;const f=setup(()=>new Promise(r=>resolve=r));try{
  f.click('Verlauf neu laden');f.setToken('owner-b');resolve(page());await waitFor(()=>f.host.textContent.includes('Konto hat gewechselt'));assert.equal(f.host.querySelectorAll('.history-entry').length,0);
 }finally{f.cleanup();}
 const g=setup();try{g.click('Verlauf neu laden');await g.settle();Object.defineProperty(g.w.document,'hidden',{value:true,configurable:true});g.w.document.dispatchEvent(new g.w.Event('visibilitychange'));assert.equal(g.host.querySelectorAll('.history-entry').length,0);}finally{g.cleanup();}
});
test('offline/reconnect makes no automatic request and stale account links are blocked',async()=>{
 const f=setup();try{
  f.click('Verlauf neu laden');await f.settle();const link=f.host.querySelector('.history-entry a');f.setToken('owner-b');const event=new f.w.MouseEvent('click',{cancelable:true,bubbles:true});link.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(f.host.querySelectorAll('.history-entry').length,0);
  const count=f.calls.length;Object.defineProperty(f.w.navigator,'onLine',{value:false,configurable:true});f.w.dispatchEvent(new f.w.Event('offline'));assert.equal(f.host.querySelector('button').disabled,true);Object.defineProperty(f.w.navigator,'onLine',{value:true,configurable:true});f.w.dispatchEvent(new f.w.Event('online'));assert.equal(f.calls.length,count);assert.equal(f.host.querySelectorAll('.history-entry').length,0);
 }finally{f.cleanup();}
});
test('single flight suppresses extra loads and disposing the host prevents late rendering',async()=>{
 let resolve;const f=setup(()=>new Promise(r=>resolve=r));try{f.click('Verlauf neu laden');f.click('Verlauf neu laden');assert.equal(f.calls.length,1);f.host.replaceChildren();await new Promise(r=>setTimeout(r,0));resolve(page());await new Promise(r=>setTimeout(r,0));assert.equal(f.ui.root.childElementCount,0);}finally{f.cleanup();}
});
test('read client is GET-only, validates response and hides arbitrary network details',async()=>{
 const calls=[];await readDownloadHistory({token:'fixture',status:'paid',fetcher:async(url,options)=>{calls.push({url,options});return Response.json(page([item('paid')],null,'paid'));}});assert.match(calls[0].url,/status=paid/);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
 await assert.rejects(readDownloadHistory({token:'fixture',fetcher:async()=>Response.json(page([item()],null,'paid'))}),{code:'INVALID_RESPONSE'});
 await assert.rejects(readDownloadHistory({token:'fixture',fetcher:async()=>{throw Error('private token');}}),e=>e.code==='SHOP_UNAVAILABLE'&&!e.message.includes('private'));
 await assert.rejects(readDownloadHistory({token:'',fetcher:()=>{throw Error('unexpected');}}),{code:'UNAUTHORIZED'});
});

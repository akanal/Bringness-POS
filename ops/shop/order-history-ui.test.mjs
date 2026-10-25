import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {mountOrderHistory} from '../../apps/web/public/shop/order-history-ui.js';
import {validOrderHistory,readOrderHistory} from '../../apps/web/public/shop/order-history-client.js';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const item=(status='prepared')=>({id:crypto.randomUUID(),status,createdAt:new Date().toISOString(),productId:'pos-download',planCode:'download_license',period:'once',currency:'EUR',netCents:39900,vatCents:7581,grossCents:47481,paymentMode:'test',licence:'blocked',purchaseCompleted:false});
const page=(items=[item()],more=null,status='all',scope='a'.repeat(64))=>({version:1,scope,status,product:'all',reference:null,checkedAt:new Date().toISOString(),items,nextCursor:more,canPay:false,canActivate:false,checkoutConnected:false});
async function waitFor(fn){const end=Date.now()+3000;while(!fn()){assert.ok(Date.now()<end,'history UI timed out');await new Promise(r=>setTimeout(r,5));}}
function setup(request=async()=>page()){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://fixture.example.test/shop/download-history.html'}),w=dom.window,host=w.document.getElementById('host'),calls=[];let token='owner-a';
 const ui=mountOrderHistory({host,getToken:()=>token,request:options=>{calls.push(options);return request(options);}}),click=text=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();};
 return {w,host,ui,calls,click,setToken:value=>token=value,settle:()=>waitFor(()=>ui.root.getAttribute('aria-busy')==='false'),cleanup(){ui.dispose();w.close();}};
}
test('history validates identities, original VAT, fixed release gates and filtered contents',()=>{
 const p=page([item('paid')]);assert.equal(validOrderHistory(p),true);
 for(const patch of [{canPay:true},{nextCursor:'?'},{items:[p.items[0],p.items[0]]},{items:[{...p.items[0],grossCents:1}]},{items:[{...p.items[0],licence:'active'}]},{status:'prepared'},{scope:'bad'},{checkedAt:'bad'}])assert.equal(validOrderHistory({...p,...patch}),false);
 assert.equal(validOrderHistory(page([],null)),true);assert.equal(validOrderHistory(page([],'cGFnZTI')),false);
});
test('mount is idle; explicit read renders recorded status and the exact review reference',async()=>{
 const row=item('paid'),f=setup(async()=>page([row]));try{
  assert.equal(f.calls.length,0);f.click('Verlauf neu laden');await f.settle();assert.equal(f.calls.length,1);assert.match(f.host.textContent,/Lizenz weiterhin gesperrt/);assert.match(f.host.textContent,/399,00/);assert.match(f.host.textContent,/75,81/);assert.match(f.host.textContent,/474,81/);
  assert.equal(f.host.querySelector('.history-entry a').getAttribute('href'),'/shop/download-review.html#checkout='+row.id);assert.equal(f.host.querySelector('[data-shop-status=completed]'),null);assert.equal(f.host.querySelectorAll('input').length,2);
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
  f.click('Verlauf neu laden');await f.settle();const select=f.host.querySelector('[aria-label="Kaufstatus filtern"]');changed=true;select.value='paid';select.dispatchEvent(new f.w.Event('change'));await f.settle();assert.equal(f.calls[1].cursor,null);assert.equal(f.calls[1].status,'paid');assert.equal(f.host.querySelectorAll('.history-entry').length,1);assert.equal(f.host.querySelector('.history-entry .shop-status').dataset.shopStatus,'paid');
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
 const calls=[];await readOrderHistory({token:'fixture',status:'paid',fetcher:async(url,options)=>{calls.push({url,options});return Response.json(page([item('paid')],null,'paid'));}});assert.match(calls[0].url,/status=paid/);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
 await assert.rejects(readOrderHistory({token:'fixture',fetcher:async()=>Response.json(page([item()],null,'paid'))}),{code:'INVALID_RESPONSE'});
 await assert.rejects(readOrderHistory({token:'fixture',fetcher:async()=>{throw Error('private token');}}),e=>e.code==='SHOP_UNAVAILABLE'&&!e.message.includes('private'));
 await assert.rejects(readOrderHistory({token:'',fetcher:()=>{throw Error('unexpected');}}),{code:'UNAUTHORIZED'});
});
test('monthly history retains amount cadence and links to exact return reference',async()=>{
 const row={...item('open'),productId:'pos-online',planCode:'pos_base_monthly',period:'monthly',netCents:1999,vatCents:380,grossCents:2379},f=setup(async()=>page([row]));try{f.click('Verlauf neu laden');await f.settle();assert.match(f.host.textContent,/monatlich/);assert.match(f.host.textContent,/19,99/);assert.equal(f.host.querySelector('.history-entry a').getAttribute('href'),'/shop/payment-return.html#checkout='+row.id);}finally{f.cleanup();}
});
test('product filter resets pages and refuses response for a different product',async()=>{
 const f=setup(async q=>({...page([item()]),product:'all'}));try{f.click('Verlauf neu laden');await f.settle();const select=f.host.querySelector('[aria-label="Produkt filtern"]');select.value='pos-online';select.dispatchEvent(new f.w.Event('change'));await f.settle();assert.equal(f.calls[1].product,'pos-online');assert.equal(f.calls[1].cursor,null);assert.equal(f.host.querySelectorAll('.history-entry').length,0);}finally{f.cleanup();}
});
test('exact reference search is explicit, resets pagination and clears on account switch',async()=>{
 const row=item(),f=setup(async q=>({...page([row]),reference:q.reference}));try{
  const input=f.host.querySelector('[aria-label="Vorgangsnummer suchen"]'),form=input.closest('form');input.value='bad';form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));assert.equal(f.calls.length,0);input.value=row.id;form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));await f.settle();assert.equal(f.calls[0].reference,row.id);assert.equal(f.calls[0].cursor,null);assert.equal(f.host.querySelectorAll('.history-entry').length,1);f.setToken('owner-b');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(input.value,'');assert.equal(f.host.querySelectorAll('.history-entry').length,0);
 }finally{f.cleanup();}
});
test('history reference copy falls back to selection and rejects a changed account',async()=>{
 const row=item(),f=setup(async()=>page([row]));try{f.click('Verlauf neu laden');await f.settle();f.click('Vorgangsnummer kopieren');await new Promise(r=>setTimeout(r,0));assert.match(f.host.textContent,/Vorgangsnummer markiert/);assert.equal(f.host.querySelector('.record-reference').value,row.id);f.setToken('owner-b');f.click('Vorgangsnummer kopieren');assert.equal(f.host.querySelectorAll('.history-entry').length,0);}finally{f.cleanup();}
});
test('all-filter reset clears product status and reference in one explicit read',async()=>{
 const f=setup(async q=>({...page([]),status:q.status,product:q.product,reference:q.reference}));try{const product=f.host.querySelector('[aria-label="Produkt filtern"]');product.value='pos-online';product.dispatchEvent(new f.w.Event('change'));await f.settle();const status=f.host.querySelector('[aria-label="Kaufstatus filtern"]');status.value='paid';status.dispatchEvent(new f.w.Event('change'));await f.settle();const input=f.host.querySelector('[aria-label="Vorgangsnummer suchen"]');input.value=item().id;input.closest('form').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await f.settle();assert.match(f.host.textContent,/Kein Vorgang mit dieser Nummer/);const n=f.calls.length;f.click('Alle Filter zurücksetzen');await f.settle();assert.equal(f.calls.length,n+1);assert.equal(f.calls.at(-1).product,'all');assert.equal(f.calls.at(-1).status,'all');assert.equal(f.calls.at(-1).reference,null);assert.equal(input.value,'');}finally{f.cleanup();}
});
test('clipboard success arriving after account change cannot restore a private card',async()=>{
 const f=setup();let complete;Object.defineProperty(f.w.navigator,'clipboard',{value:{writeText:()=>new Promise(r=>complete=r)},configurable:true});try{f.click('Verlauf neu laden');await f.settle();f.click('Vorgangsnummer kopieren');f.setToken('owner-b');f.w.dispatchEvent(new f.w.Event('focus'));complete();await new Promise(r=>setTimeout(r,0));assert.equal(f.host.querySelectorAll('.history-entry').length,0);assert.equal(f.host.textContent.includes('Vorgangsnummer kopiert.'),false);}finally{f.cleanup();}
});
test('printing is explicit and disabled for empty loading offline or changed-account views',async()=>{
 const f=setup();let prints=0;f.w.print=()=>{prints++;};try{const button=[...f.host.querySelectorAll('button')].find(b=>b.textContent==='Geladene Vorgänge drucken');assert.equal(button.disabled,true);f.click('Verlauf neu laden');await f.settle();assert.equal(button.disabled,false);f.click('Geladene Vorgänge drucken');assert.equal(prints,1);assert.match(f.host.textContent,/Shop-Vorgangsverlauf · keine Rechnung/);f.setToken('owner-b');f.click('Geladene Vorgänge drucken');assert.equal(prints,1);assert.equal(button.disabled,true);assert.equal(f.host.querySelectorAll('.history-entry').length,0);}finally{f.cleanup();}
});
test('printing failures show only safe feedback and preserve recorded history',async()=>{
 const f=setup();f.w.print=()=>{throw Error('private printer path');};try{f.click('Verlauf neu laden');await f.settle();f.click('Geladene Vorgänge drucken');assert.match(f.host.textContent,/Druckansicht konnte nicht geöffnet/);assert.equal(f.host.textContent.includes('private printer path'),false);assert.equal(f.host.querySelectorAll('.history-entry').length,1);}finally{f.cleanup();}
});
test('history offers contextual status help without adding record identities to its URL',async()=>{const f=setup(async()=>page([item('uncertain')]));try{f.click('Verlauf neu laden');await f.settle();const help=[...f.host.querySelectorAll('a')].find(a=>a.textContent==='Hilfe zu diesem Status');assert.equal(help.getAttribute('href'),'/shop/help.html#topic=status-uncertain');assert.equal(help.referrerPolicy,'no-referrer');assert.equal(f.calls.length,1);}finally{f.cleanup();}});

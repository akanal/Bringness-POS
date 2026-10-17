import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const restaurant='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
const key='bringness.checkout.pending.v1:'+restaurant;
const script=fs.readFileSync(new URL('../../apps/web/public/pos/payment-flow.js',import.meta.url),'utf8');
const basket=[{id:product,qty:1,price:2.5}];
function fixture(items=basket){
 const dom=new JSDOM('<div class="basket"><select id="restaurant"><option value="'+restaurant+'">Test</option></select><select id="paymentMethod"><option value="cash">Cash</option><option value="card">Card</option></select><button id="pay">Pay</button><p id="saleMsg"></p></div>',{runScripts:'outside-only',url:'https://register.test/pos/'});
 const w=dom.window;w.eval('var cart='+JSON.stringify(items)+';function renderCart(){}');w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {w,pay:()=>w.document.getElementById('pay').onclick(),message:()=>w.document.getElementById('saleMsg').textContent};
}
const response=(body)=>({requestKey:body.requestKey,id:'33333333-3333-4333-8333-333333333333',restaurantId:body.restaurantId,totalCents:body.payments.reduce((sum,p)=>sum+p.amountCents,0),status:'paid',receiptNumber:'BN-1'});
// A lost acknowledgement survives a complete browser restart; even an empty cart can reconcile it.
const first=fixture();let original,stored,count=0;
first.w.api=async(path,opt)=>{original=JSON.parse(opt.body);assert.equal(count++,0);throw Error('socket after commit');};
await first.pay();stored=first.w.localStorage.getItem(key);assert(stored);assert(first.message().includes('ungeklärt'));assert(!first.message().includes('nicht gespeichert'));first.w.close();
const restart=fixture([]);restart.w.localStorage.setItem(key,stored);
restart.w.api=async(path,opt)=>{assert.deepEqual(JSON.parse(opt.body),original);return {...response(original),replayed:true};};
await restart.pay();assert.equal(restart.w.localStorage.getItem(key),null);assert(restart.message().includes('Verkauf gespeichert'));restart.w.close();
// A double click cannot dispatch two in-flight requests; new unsent basket edits survive acknowledgement.
const concurrent=fixture();let resolve,calls=0;
concurrent.w.api=async(path,opt)=>{calls++;return new Promise(done=>{resolve=()=>done(response(JSON.parse(opt.body)));});};
const pending=concurrent.pay();await concurrent.pay();assert.equal(calls,1);concurrent.w.eval('cart.push({id:"'+product+'",qty:2,price:2.5})');resolve();await pending;assert.equal(concurrent.w.eval('cart.length'),2);concurrent.w.close();
// Failed persistence must stop before contacting checkout.
const blocked=fixture();let contacted=false;blocked.w.api=async()=>{contacted=true;};Object.defineProperty(blocked.w,'localStorage',{value:{getItem(){return null;},setItem(){throw Error('quota');}}});
await blocked.pay();assert.equal(contacted,false);assert(blocked.message().includes('Keine neue Zahlung'));blocked.w.close();
// A client confirmation can never authorize an unverified card settlement.
const card=fixture();card.w.api=async()=>{throw Error('must not send');};card.w.document.getElementById('paymentMethod').value='card';card.w.confirm=()=>{throw Error('must not ask for unverified confirmation');};await card.pay();assert(card.message().includes('serverseitig'));card.w.close();
// Corrections reuse the original UUID rather than creating another financial operation.
const correction=fixture();let attempt=0,requestKey;
correction.w.api=async(path,opt)=>{const b=JSON.parse(opt.body);if(!attempt++){requestKey=b.requestKey;throw Object.assign(Error('price changed'),{status:400});}assert.equal(b.requestKey,requestKey);assert.equal(b.payments[0].amountCents,300);return response(b);};
await correction.pay();correction.w.eval('cart[0].price=3');await correction.pay();assert.equal(attempt,2);assert.equal(correction.w.localStorage.getItem(key),null);correction.w.close();
// An incomplete response cannot clear durable recovery state.
const incomplete=fixture();incomplete.w.api=async()=>({receiptNumber:'fake'});await incomplete.pay();assert(incomplete.w.localStorage.getItem(key));incomplete.w.close();
console.log('Checkout UI passed: durable immutable retry across reload, empty-cart recovery, double-submit guard, unsent-cart preservation, storage failure, card guard, same-key correction and incomplete-ack retention.');

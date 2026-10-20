import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {checkAddress} from '../address-check.js';
const addressScript=await fs.readFile(new URL('../../apps/web/public/pos/address-check.js',import.meta.url),'utf8');
const script=await fs.readFile(new URL('../../apps/web/public/pos/customer-delivery.js',import.meta.url),'utf8');
const rid=crypto.randomUUID(),pid=crypto.randomUUID(),cid=crypto.randomUUID(),key='bringness.delivery.pending.v1:'+rid;
const address={name:'Customer <script>bad</script>',street:'Street 1',postalCode:'10115',city:'Berlin',country:'Deutschland',vatId:'',email:'buyer@example.test',phone:'123'};
let lost=true,requests=[],updates=[];
const api=async(path,opt)=>{
 if(path==='/address-check'){const b=JSON.parse(opt.body);assert.deepEqual(Object.keys(b.address).sort(),['city','country','postalCode','street']);return checkAddress(b.address,{complete:b.complete});}
 if(path.startsWith('/customers?'))return {customers:[{id:cid,data:address,version:2}]};
 if(path==='/customers'){updates.push(JSON.parse(opt.body));return {id:cid};}
 if(path==='/delivery-notes'){const b=JSON.parse(opt.body);requests.push(b);if(lost)throw Error('connection lost');return {deliveryNote:{id:crypto.randomUUID(),number:'LS-TEST',recipient:b.recipient,sender:{company_name:'Seller <img src=x>',street:'Sender 1',postal_code:'10115',city:'Berlin'},items:[{name:'Item <script>x</script>',qty:5}],note:'<img onerror=x>',issued_at:new Date().toISOString()}};}
 if(path.startsWith('/delivery-notes?'))return {deliveryNotes:[]};throw Error(path);
};
function fixture(stored){const dom=new JSDOM('<select id="restaurant"><option value="'+rid+'">Shop</option></select><div id="moduleBody"></div>',{runScripts:'outside-only',url:'https://test.example/pos/'});const w=dom.window;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.eval('var data='+JSON.stringify({products:[{id:pid,restaurantId:rid,name:'Article <script>x</script>'}]})+';');w.api=api;if(stored)w.localStorage.setItem(key,stored);w.eval(addressScript);w.eval(script);return w;}
const w=fixture();
try{
 await w.renderCustomerDeliveryModule();await new Promise(r=>setTimeout(r,0));const d=w.document,e=k=>d.querySelector('[data-'+k+']');assert.equal(d.querySelectorAll('script').length,0);e('customers').value=cid;await e('use').onclick();assert.equal(d.getElementById('trade-name').value,address.name);
 // Actual address checker marks both fields, removes stale errors on edit and supports preview fields.
 d.getElementById('trade-city').value='Hamburg';d.getElementById('trade-city').dispatchEvent(new w.Event('blur'));await new Promise(r=>setTimeout(r,0));
 assert.equal(d.getElementById('trade-city').getAttribute('aria-invalid'),'true');assert.equal(d.getElementById('trade-postalCode').getAttribute('aria-invalid'),'true');assert.match(d.querySelector('.address-check').textContent,/Berlin/);
 d.getElementById('trade-city').value='Berlin';d.getElementById('trade-city').dispatchEvent(new w.Event('input'));assert.equal(d.getElementById('trade-postalCode').hasAttribute('aria-invalid'),false);
 await e('update').onclick();assert.equal(updates[0].version,2);assert.equal(updates[0].customer.email,address.email);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 d.querySelector('[data-delivery-qty]').value='5';await e('preview').onclick();
 assert(d.querySelector('dialog').open);assert.equal(d.querySelectorAll('dialog script').length,0);
 const nameField=d.querySelector('dialog input[aria-label="Name / Firma"]');nameField.value='Updated customer';nameField.dispatchEvent(new w.Event('input'));assert.equal(d.getElementById('trade-name').value,'Updated customer');
 const previewCity=d.querySelector('dialog input[aria-label="Ort"]');previewCity.value='Hamburg';previewCity.dispatchEvent(new w.Event('input'));previewCity.dispatchEvent(new w.Event('blur'));await new Promise(r=>setTimeout(r,0));assert.equal(previewCity.getAttribute('aria-invalid'),'true');
 previewCity.value='Berlin';previewCity.dispatchEvent(new w.Event('input'));assert.equal(previewCity.hasAttribute('aria-invalid'),false);
 assert.match(d.querySelector('dialog table').textContent,/Article/);d.querySelector('dialog button').click();assert.equal(d.querySelector('dialog'),null);
 d.querySelector('[data-delivery-qty]').value='5';await e('issue').onclick();assert.equal(requests.length,1);const stored=w.localStorage.getItem(key);assert(stored);assert.equal(e('retry').hidden,false);
 await e('issue').onclick();assert.equal(requests.length,1); // no new identity after uncertain save
 const resumed=fixture(stored);try{lost=false;await resumed.renderCustomerDeliveryModule();await resumed.document.querySelector('[data-retry]').onclick();assert.deepEqual(requests[1],requests[0]);assert.equal(resumed.localStorage.getItem(key),null);assert.match(resumed.document.querySelector('[data-status]').textContent,/Keine Zahlung/);
 resumed.document.querySelector('[data-documents] button').click();const html=resumed.document.querySelector('iframe').srcdoc;assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));assert(!html.includes('<script>'));assert(html.includes('keine Rechnung'));assert(html.includes('Seller'));}finally{resumed.close();}
 const broken=fixture('{broken');try{await broken.renderCustomerDeliveryModule();await broken.document.querySelector('[data-retry]').onclick();assert.equal(requests.length,2);assert.equal(broken.localStorage.getItem(key),'{broken');}finally{broken.close();}
 console.log('Customer/delivery UI passed: retail access independent of trade, saved address/contact reuse, versioned edit, persistent lost-response identity, replay after reload, corrupt storage refusal and escaped printable A4 document.');
}finally{w.close();}

// Late replies and unavailable reference checks must never overwrite corrected fields or mark them invalid.
const race=fixture();try{
 const d=race.document;await race.renderCustomerDeliveryModule();const inputs=Object.fromEntries(['street','postalCode','city','country'].map(k=>[k,d.getElementById('trade-'+k)]));for(const [k,v]of Object.entries(address))if(inputs[k])inputs[k].value=v;
 let resolve;race.api=()=>new Promise(r=>resolve=r);
 const ctrl=race.bnMountAddressCheck(d.getElementById('moduleBody'),{inputs,read:()=>Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value]))});
 const pending=ctrl.check();inputs.city.value='Hamburg';inputs.city.dispatchEvent(new race.Event('input'));resolve({issues:[{fields:['city'],message:'stale'}]});await pending;assert.equal(inputs.city.hasAttribute('aria-invalid'),false);assert(!d.body.textContent.includes('stale'));
 race.api=async()=>{throw Error('unavailable');};await ctrl.check();assert.equal(inputs.city.hasAttribute('aria-invalid'),false);assert.match(d.body.textContent,/Adressprüfung derzeit nicht verfügbar/);
}finally{race.close();}

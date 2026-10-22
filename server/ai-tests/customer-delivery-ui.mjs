import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {checkAddress} from '../address-check.js';
const addressScript=await fs.readFile(new URL('../../apps/web/public/pos/address-check.js',import.meta.url),'utf8');
const script=await fs.readFile(new URL('../../apps/web/public/pos/customer-delivery.js',import.meta.url),'utf8');
const rid=crypto.randomUUID(),pid=crypto.randomUUID(),cid=crypto.randomUUID(),key='bringness.delivery.pending.v1:'+rid;
const address={name:'Customer <script>bad</script>',street:'Street 1',postalCode:'10115',city:'Berlin',country:'Deutschland',vatId:'',taxNumber:'12/345',email:'buyer@example.test',phone:'123'};
let lost=true,requests=[],updates=[];
const api=async(path,opt)=>{
 if(path==='/address-check'){const b=JSON.parse(opt.body);assert.deepEqual(Object.keys(b.address).sort(),['city','country','postalCode','street']);return checkAddress(b.address,{complete:b.complete});}
 if(path.startsWith('/customers?'))return {customers:[{id:cid,data:address,version:2}]};
 if(path==='/customers'){const b=JSON.parse(opt.body);updates.push(b);return {id:cid,data:b.customer,version:(b.version||0)+1};}
 if(path==='/delivery-notes'){const b=JSON.parse(opt.body);requests.push(b);if(lost)throw Error('connection lost');return {deliveryNote:{id:crypto.randomUUID(),number:'LS-TEST',recipient:b.recipient,sender:{company_name:'Seller <img src=x>',street:'Sender 1',postal_code:'10115',city:'Berlin'},items:[{name:'Item <script>x</script>',qty:5}],note:'<img onerror=x>',issued_at:new Date().toISOString()}};}
 if(path.startsWith('/delivery-notes?'))return {deliveryNotes:[]};throw Error(path);
};
function fixture(stored){const dom=new JSDOM('<select id="restaurant"><option value="'+rid+'">Shop</option></select><div id="moduleBody"></div>',{runScripts:'outside-only',url:'https://test.example/pos/'});const w=dom.window;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.eval('var data='+JSON.stringify({products:[{id:pid,restaurantId:rid,name:'Article <script>x</script>'}]})+';');w.api=api;if(stored)w.localStorage.setItem(key,stored);w.eval(addressScript);w.eval(script);return w;}
const w=fixture();
try{
 await w.renderCustomerDeliveryModule();await new Promise(r=>setTimeout(r,0));const d=w.document,e=k=>d.querySelector('[data-'+k+']');assert.equal(d.querySelectorAll('script').length,0);e('customers').value=cid;await e('customers').onchange();for(const k of ['name','street','postalCode','city','country','vatId'])assert.equal(d.getElementById('trade-'+k).value,address[k]);assert.equal(e('email').value,address.email);assert.equal(e('phone').value,address.phone);assert.match(e('customers').selectedOptions[0].textContent,/Street 1 · 10115 Berlin · Deutschland/);
 e('search').value='buyer@example.test';await e('find').onclick();assert.equal(e('customers').value,cid);assert.equal(e('email').value,address.email);assert.match(e('customer-status').textContent,/übernommen/);
 // Actual address checker marks both fields, removes stale errors on edit and supports preview fields.
 d.getElementById('trade-city').value='Hamburg';d.getElementById('trade-city').dispatchEvent(new w.Event('blur'));await new Promise(r=>setTimeout(r,0));
 assert.equal(d.getElementById('trade-city').getAttribute('aria-invalid'),'true');assert.equal(d.getElementById('trade-postalCode').getAttribute('aria-invalid'),'true');assert.match(d.querySelector('.address-check').textContent,/Berlin/);
 d.getElementById('trade-city').value='Berlin';d.getElementById('trade-city').dispatchEvent(new w.Event('input'));assert.equal(d.getElementById('trade-postalCode').hasAttribute('aria-invalid'),false);
 await e('update').onclick();assert.equal(updates[0].version,2);assert.deepEqual(updates[0].customer,address);e('search').value='old search';await e('save').onclick();assert.equal(e('search').value,'');assert.equal(e('customers').value,cid);assert.deepEqual(updates[1].customer,address);
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

// A new search typed during a slow lookup must run after the old response.
const queued=fixture();try{
 await queued.renderCustomerDeliveryModule();await new Promise(r=>setTimeout(r,0));const d=queued.document,search=d.querySelector('[data-search]'),find=d.querySelector('[data-find]');let release,lookups=[];
 queued.api=async(path,opt)=>{if(path.startsWith('/customers?')){const q=new URL('https://fixture.test'+path).searchParams.get('q');lookups.push(q);if(q==='slow')return new Promise(resolve=>release=()=>resolve({customers:[{id:cid,version:2,data:{...address,name:'Old response'}}]}));return {customers:[{id:cid,version:2,data:{...address,name:'Latest response'}}]};}return api(path,opt);};
 search.value='slow';const first=find.onclick();search.value='latest';await find.onclick();release();await first;for(let n=0;n<8;n++)await new Promise(r=>setTimeout(r,0));assert(lookups.includes('latest'));assert.equal(d.getElementById('trade-name').value,'Latest response');
}finally{queued.close();}

// A rejected duplicate click must not unlock the first save for a third click.
const saves=fixture();try{
 await saves.renderCustomerDeliveryModule();await new Promise(r=>setTimeout(r,0));const d=saves.document;for(const [k,v]of Object.entries(address)){const input=d.getElementById('trade-'+k);if(input)input.value=v;}let writes=0,releases=[];
 saves.api=async(path,opt)=>{if(path==='/customers'){writes++;return new Promise(resolve=>releases.push(()=>resolve({id:cid,version:3,data:JSON.parse(opt.body).customer})));}return api(path,opt);};
 const button=d.querySelector('[data-save]'),first=button.onclick();for(let n=0;n<8&&!writes;n++)await new Promise(r=>setTimeout(r,0));await button.onclick();const third=button.onclick();for(let n=0;n<4;n++)await new Promise(r=>setTimeout(r,0));const count=writes;releases.forEach(fn=>fn());await Promise.all([first,third]);assert.equal(count,1);
}finally{saves.close();}

// A confirmed customer save stays usable even when subsequent list reads fail.
const confirmed=fixture();try{
 await confirmed.renderCustomerDeliveryModule();await new Promise(r=>setTimeout(r,0));const d=confirmed.document,e=k=>d.querySelector('[data-'+k+']');
 e('customers').value=cid;await e('use').onclick();let lookups=0,writes=[];
 confirmed.api=async(path,opt)=>{
  if(path.startsWith('/customers?')){lookups++;throw Error('Kundenliste nicht erreichbar');}
  if(path==='/customers'){const body=JSON.parse(opt.body);writes.push({method:opt.method,...body});return {id:cid,version:(body.version||0)+1,data:{...body.customer,name:body.customer.name.trim()}};}
  return api(path,opt);
 };
 d.getElementById('trade-street').value='Neue Straße 8';e('phone').value='030999';await e('update').onclick();
 assert.match(e('customer-status').textContent,/Kunde aktualisiert/);assert.equal(e('customers').value,cid);assert.match(e('customers').selectedOptions[0].textContent,/Neue Straße 8/);assert.equal(lookups,0);
 e('email').value='new@example.test';await e('save').onclick();assert.equal(writes.length,2);assert.equal(writes[0].method,'PUT');assert.equal(writes[0].version,2);assert.equal(writes[1].method,'PUT');assert.equal(writes[1].version,3);assert.equal(writes[1].customer.phone,'030999');assert.equal(writes[1].customer.email,'new@example.test');
 // Reusing the selected customer takes the server-confirmed address and contacts.
 d.getElementById('trade-street').value='Unsaved';await e('use').onclick();assert.equal(d.getElementById('trade-street').value,'Neue Straße 8');assert.equal(e('email').value,'new@example.test');assert.equal(e('phone').value,'030999');
 e('customers').value='';await e('save').onclick();assert.equal(writes.at(-1).method,'POST');assert.equal(e('customers').value,cid);await e('save').onclick();assert.equal(writes.at(-1).method,'PUT');assert.equal(writes.at(-1).version,1);assert.equal(lookups,0);
}finally{confirmed.close();}

// A list opened before a save cannot later replace its confirmed customer version.
const staleList=fixture();try{
 let release;staleList.api=async(path,opt)=>path.startsWith('/customers?')?new Promise(resolve=>release=resolve):path==='/customers'?{id:cid,version:7,data:JSON.parse(opt.body).customer}:api(path,opt);
 await staleList.renderCustomerDeliveryModule();const d=staleList.document;for(const [k,v]of Object.entries(address)){const input=d.getElementById('trade-'+k);if(input)input.value=v;}
 await d.querySelector('[data-save]').onclick();release({customers:[]});await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelector('[data-customers]').value,cid);
 let updated;staleList.api=async(path,opt)=>{if(path==='/customers'){updated=JSON.parse(opt.body);return {id:cid,version:8,data:updated.customer};}return api(path,opt);};await d.querySelector('[data-update]').onclick();assert.equal(updated.version,7);
}finally{staleList.close();}

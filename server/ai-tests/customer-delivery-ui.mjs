import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const script=await fs.readFile(new URL('../../apps/web/public/pos/customer-delivery.js',import.meta.url),'utf8');
const rid=crypto.randomUUID(),pid=crypto.randomUUID(),cid=crypto.randomUUID(),key='bringness.delivery.pending.v1:'+rid;
const address={name:'Customer <script>bad</script>',street:'Street 1',postalCode:'10115',city:'Berlin',country:'Deutschland',vatId:'',email:'buyer@example.test',phone:'123'};
let lost=true,requests=[],updates=[];
const api=async(path,opt)=>{
 if(path.startsWith('/customers?'))return {customers:[{id:cid,data:address,version:2}]};
 if(path==='/customers'){updates.push(JSON.parse(opt.body));return {id:cid};}
 if(path==='/delivery-notes'){const b=JSON.parse(opt.body);requests.push(b);if(lost)throw Error('connection lost');return {deliveryNote:{id:crypto.randomUUID(),number:'LS-TEST',recipient:b.recipient,sender:{company_name:'Seller <img src=x>',street:'Sender 1',postal_code:'10115',city:'Berlin'},items:[{name:'Item <script>x</script>',qty:5}],note:'<img onerror=x>',issued_at:new Date().toISOString()}};}
 if(path.startsWith('/delivery-notes?'))return {deliveryNotes:[]};throw Error(path);
};
function fixture(stored){const dom=new JSDOM('<select id="restaurant"><option value="'+rid+'">Shop</option></select><div id="moduleBody"></div>',{runScripts:'outside-only',url:'https://test.example/pos/'});const w=dom.window;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.eval('var data='+JSON.stringify({products:[{id:pid,restaurantId:rid,name:'Article <script>x</script>'}]})+';');w.api=api;if(stored)w.localStorage.setItem(key,stored);w.eval(script);return w;}
const w=fixture();
try{
 await w.renderCustomerDeliveryModule();await new Promise(r=>setTimeout(r,0));const d=w.document,e=k=>d.querySelector('[data-'+k+']');assert.equal(d.querySelectorAll('script').length,0);e('customers').value=cid;await e('use').onclick();assert.equal(d.getElementById('trade-name').value,address.name);
 await e('update').onclick();assert.equal(updates[0].version,2);assert.equal(updates[0].customer.email,address.email);
 d.querySelector('[data-delivery-qty]').value='5';await e('issue').onclick();assert.equal(requests.length,1);const stored=w.localStorage.getItem(key);assert(stored);assert.equal(e('retry').hidden,false);
 await e('issue').onclick();assert.equal(requests.length,1); // no new identity after uncertain save
 const resumed=fixture(stored);try{lost=false;await resumed.renderCustomerDeliveryModule();await resumed.document.querySelector('[data-retry]').onclick();assert.deepEqual(requests[1],requests[0]);assert.equal(resumed.localStorage.getItem(key),null);assert.match(resumed.document.querySelector('[data-status]').textContent,/Keine Zahlung/);
 resumed.document.querySelector('[data-documents] button').click();const html=resumed.document.querySelector('iframe').srcdoc;assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));assert(!html.includes('<script>'));assert(html.includes('keine Rechnung'));assert(html.includes('Seller'));}finally{resumed.close();}
 const broken=fixture('{broken');try{await broken.renderCustomerDeliveryModule();await broken.document.querySelector('[data-retry]').onclick();assert.equal(requests.length,2);assert.equal(broken.localStorage.getItem(key),'{broken');}finally{broken.close();}
 console.log('Customer/delivery UI passed: retail access independent of trade, saved address/contact reuse, versioned edit, persistent lost-response identity, replay after reload, corrupt storage refusal and escaped printable A4 document.');
}finally{w.close();}

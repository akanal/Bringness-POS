import assert from 'node:assert/strict';
import {sellerDocumentDetails} from '../seller-document-details.js';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {JSDOM} from 'jsdom';
const script=await fs.readFile(new URL('../../apps/web/public/pos/trade.js',import.meta.url),'utf8');
const salesScript=await fs.readFile(new URL('../../apps/web/public/pos/sale-tools.js',import.meta.url),'utf8');
const rid=crypto.randomUUID(),pid=crypto.randomUUID(),key='bringness.trade.pending.v1:'+rid;
const tiers=[{product_id:pid,min_qty:1,price_cents:250},{product_id:pid,min_qty:1000,price_cents:200}];
function fixture(pending){const dom=new JSDOM('<select id="restaurant"><option value="'+rid+'">Retail</option></select><div id="moduleBody"></div>',{runScripts:'outside-only',url:'https://pos.test/pos/'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.eval('var token="fixture";var data='+JSON.stringify({products:[{id:pid,name:'Test <item>',restaurantId:rid}]})+';var $=id=>document.getElementById(id);var esc=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(\'"\',"&quot;");');
 w.ensurePersonnelAccess=async()=>true;if(pending)w.localStorage.setItem(key,pending);w.eval(salesScript);w.eval(script);return w;
}
let attempts=[],lose=true;
const w=fixture();w.api=async(path,opt)=>{if(path.startsWith('/trade/settings?'))return {enabled:true};if(path.startsWith('/trade/prices?'))return {tiers};if(path==='/orders/checkout'){const b=JSON.parse(opt.body);attempts.push(b);if(lose)throw Error('connection lost');return {receiptNumber:'BN-1',receiptId:crypto.randomUUID(),requestKey:b.requestKey,restaurantId:b.restaurantId,status:'paid',totalCents:b.payments[0].amountCents};}throw Error(path)};
try{await w.renderTradeModule();const d=w.document;assert.equal(d.querySelectorAll('#tradeProducts script').length,0);d.querySelector('[data-addqty]').value='1500';d.querySelector('[data-add]').click();assert.match(d.getElementById('tradeTotal').textContent,/3.000,00/);for(const [k,v]of Object.entries({name:'Customer',street:'Street 1',postalCode:'10115',city:'Berlin'}))d.getElementById('trade-'+k).value=v;
 await d.getElementById('tradePay').onclick();assert.equal(attempts.length,1);assert.equal(attempts[0].payments[0].amountCents,300000);const stored=w.localStorage.getItem(key);assert(stored);assert.equal(d.getElementById('tradePay').disabled,true);assert.equal(d.getElementById('tradeResume').hidden,false);
 const resumed=fixture(stored);resumed.api=w.api;try{await resumed.renderTradeModule();lose=false;await resumed.document.getElementById('tradeResume').onclick();assert.deepEqual(attempts[0],attempts[1]);assert.equal(resumed.localStorage.getItem(key),null);assert.match(resumed.document.getElementById('tradeStatus').textContent,/gespeichert/);assert.match(resumed.document.getElementById('tradeDocuments').textContent,/DIN-A4/)}finally{resumed.close()}
 const disabled=fixture(stored);disabled.api=async(path,opt)=>path.startsWith('/trade/settings?')?{enabled:false}:w.api(path,opt);try{await disabled.renderTradeModule();assert(disabled.document.getElementById('tradePay').disabled);assert.equal(disabled.document.getElementById('tradeResume').hidden,false);await disabled.document.getElementById('tradeResume').onclick();assert.equal(disabled.localStorage.getItem(key),null);disabled.document.querySelector('[data-add]').click();assert(disabled.document.getElementById('tradePay').disabled);assert.match(disabled.document.getElementById('moduleBody').textContent,/Nur die gespeicherte Zahlung/)}finally{disabled.close()}
 const blocked=fixture('{invalid');blocked.api=w.api;try{await blocked.renderTradeModule();assert.equal(blocked.document.getElementById('tradePay').disabled,true);assert.match(blocked.document.getElementById('tradeStatus').textContent,/beschädigt/)}finally{blocked.close()}
 const incomplete=fixture();incomplete.api=async(path)=>path.startsWith('/trade/settings?')?{enabled:true}:path.startsWith('/trade/prices?')?{tiers}:{};try{await incomplete.renderTradeModule();const d=incomplete.document;d.querySelector('[data-add]').click();for(const [k,v]of Object.entries({name:'Customer',street:'Street',postalCode:'10115',city:'Berlin'}))d.getElementById('trade-'+k).value=v;await d.getElementById('tradePay').onclick();assert(incomplete.localStorage.getItem(key));assert.match(d.getElementById('tradeStatus').textContent,/nicht eindeutig/);assert(d.getElementById('tradePay').disabled)}finally{incomplete.close()}
 const reduced=fixture();let payload;reduced.api=async(path,opt)=>{if(path.startsWith('/trade/settings?'))return {enabled:true};if(path.startsWith('/trade/prices?'))return {tiers};payload=JSON.parse(opt.body);return {requestKey:payload.requestKey,restaurantId:rid,id:crypto.randomUUID(),status:'paid',receiptNumber:'BN-D',receiptId:crypto.randomUUID(),totalCents:payload.payments[0].amountCents}};try{await reduced.renderTradeModule();const d=reduced.document;d.querySelector('[data-addqty]').value='1500';d.querySelector('[data-add]').click();d.querySelector('[data-kind]').value='percent';d.querySelector('[data-value]').value='12,50';d.querySelector('[data-apply]').click();assert.match(d.getElementById('tradeTotal').textContent,/2.625,00/);for(const [k,v]of Object.entries({name:'Buyer',street:'Street',postalCode:'10115',city:'Berlin'}))d.getElementById('trade-'+k).value=v;await d.getElementById('tradePay').onclick();assert.equal(payload.discount.value,1250);assert.equal(payload.payments[0].amountCents,262500)}finally{reduced.close()}
 const setup=fixture();let configured=[],savedCustomers=[];const customerScript=await fs.readFile(new URL('../../apps/web/public/pos/customer-delivery.js',import.meta.url),'utf8');
 const setupApi=async(path,opt)=>{if(path.startsWith('/trade/settings?'))return {enabled:true};if(path.startsWith('/trade/prices?'))return {tiers:configured};if(path==='/trade/prices'){configured=JSON.parse(opt.body).tiers.map(t=>({product_id:pid,min_qty:t.minQty,price_cents:t.priceCents}));return {ok:true}}if(path.startsWith('/customers?'))return {customers:savedCustomers};if(path==='/customers'){const body=JSON.parse(opt.body),id=crypto.randomUUID();savedCustomers.push({id,version:1,data:body.customer});return {id,version:1}}throw Error(path)};
 setup.api=setupApi;setup.eval(customerScript);
 try{await setup.renderTradeModule();const d=setup.document;assert.match(d.querySelector('[data-add]').textContent,/Preis festlegen/);assert.equal(d.querySelector('[data-add]').disabled,false);d.querySelector('[data-add]').click();assert(d.getElementById('tradeTiers').closest('details').open);assert.match(d.getElementById('tradeTotal').textContent,/0,00\s€/);d.querySelector('[data-tier-euro]').value='2';d.querySelector('[data-tier-cent]').value='50';await d.getElementById('tradeSavePrices').onclick();d.querySelector('[data-add]').click();assert.match(d.getElementById('tradeTotal').textContent,/2,50/);
 assert.equal(d.querySelector('details.trade-panel').open,false);for(const [k,v]of Object.entries({name:'Saved wholesale buyer',street:'Street 3',postalCode:'10115',city:'Berlin'}))d.getElementById('trade-'+k).value=v;
 await d.querySelector('[data-save]').onclick();assert.equal(savedCustomers.length,1);d.getElementById('trade-name').value='Changed';await d.querySelector('[data-use]').onclick();assert.equal(d.getElementById('trade-name').value,'Saved wholesale buyer');
 const reload=fixture();reload.api=setupApi;reload.eval(customerScript);try{await reload.renderTradeModule();await new Promise(r=>setImmediate(r));reload.document.querySelector('[data-customers]').value=savedCustomers[0].id;await reload.document.querySelector('[data-use]').onclick();assert.equal(reload.document.getElementById('trade-street').value,'Street 3')}finally{reload.close()}
 }finally{setup.close()}
 console.log('Trade setup passed: missing prices remain selectable, PIN-save unlocks sale, customer address persists and reloads in the actual wholesale view.');
 console.log('Trade UI passed: large-quantity tier total, escaped product text, explicit cash confirmation, persistent uncertain sale, exact replay after browser restart and corrupt-storage refusal.');
}finally{w.close()}

// Structured tier fields never require a separator or decimal punctuation.
const tierWindow=fixture();let tierRows=tiers.map(t=>({...t})),tierWrites=[],failTierSave=false;
tierWindow.api=async(path,opt)=>{
 if(path.startsWith('/trade/settings?'))return {enabled:true};
 if(path.startsWith('/trade/prices?'))return {tiers:tierRows};
 if(path==='/trade/prices'){
  const body=JSON.parse(opt.body);if(failTierSave)throw Error('Fixture save unavailable');
  tierWrites.push(body);tierRows=body.tiers.map(t=>({product_id:body.productId,min_qty:t.minQty,price_cents:t.priceCents}));return {ok:true};
 }
 throw Error('Unexpected request '+path);
};
try{
 await tierWindow.renderTradeModule();const d=tierWindow.document,rows=()=>[...d.querySelectorAll('.trade-tier-row')],save=()=>d.getElementById('tradeSavePrices').onclick();
 assert.equal(d.querySelector('textarea'),null);assert.equal(rows().length,2);
 assert.equal(rows()[0].querySelector('[data-tier-euro]').value,'2');assert.equal(rows()[0].querySelector('[data-tier-cent]').value,'50');
 rows()[0].querySelector('[data-tier-euro]').value='9';rows()[0].querySelector('[data-tier-cent]').value='99';
 await save();assert.equal(tierWrites[0].tiers[0].priceCents,999);
 d.getElementById('tradeAddTier').click();let row=rows().at(-1);row.querySelector('[data-tier-qty]').value='2000';row.querySelector('[data-tier-euro]').value='8';row.querySelector('[data-tier-cent]').value='';
 await save();assert.equal(tierWrites.at(-1).tiers.at(-1).priceCents,800);
 const before=tierWrites.length;row=rows().at(-1);row.querySelector('[data-tier-qty]').value='1';await save();assert.equal(tierWrites.length,before);assert.match(d.getElementById('tradeStatus').textContent,/nur einmal/);
 row.querySelector('[data-tier-qty]').value='2000';row.querySelector('[data-tier-cent]').value='100';await save();assert.equal(tierWrites.length,before);assert.equal(d.activeElement,row.querySelector('[data-tier-cent]'));
 row.querySelector('[data-tier-cent]').value='05';failTierSave=true;await save();assert.equal(row.querySelector('[data-tier-cent]').value,'05');assert.match(d.getElementById('tradeStatus').textContent,/unavailable/);assert(!d.getElementById('tradeSavePrices').disabled);failTierSave=false;
 while(rows().length<20)d.getElementById('tradeAddTier').click();assert(d.getElementById('tradeAddTier').disabled);assert.equal(rows().length,20);
 rows().forEach(r=>r.querySelector('[data-tier-remove]').click());await save();assert.deepEqual(tierWrites.at(-1).tiers,[]);assert.equal(rows().length,1);assert.equal(rows()[0].querySelector('[data-tier-euro]').value,'');
 console.log('Structured trade tiers passed: loaded values, digits-only euro/cent, add/remove, duplicate and cents validation, 20-row limit, failed-save preservation and explicit removal of all prices.');
}finally{tierWindow.close()}

const invoiceWindow=fixture();const invoiceCalls=[];let sellerSaved={bankName:'Musterbank',iban:'DE89370400440532013000',taxNumber:'12/345'};
invoiceWindow.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
invoiceWindow.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new invoiceWindow.Event('close'));};
invoiceWindow.eval(await fs.readFile(new URL('../../apps/web/public/pos/customer-delivery.js',import.meta.url),'utf8'));
invoiceWindow.api=async(path,opt)=>{invoiceCalls.push({path,method:opt?.method||'GET'});if(path.startsWith('/trade/settings?'))return {enabled:true};if(path.startsWith('/trade/prices?'))return {tiers};if(path.startsWith('/customers?'))return {customers:[]};if(path==='/billing/document-details'){sellerSaved=sellerDocumentDetails(JSON.parse(opt.body));return {documentDetails:sellerSaved};}if(path==='/billing/profile')return {profile:{company_name:'ahmet.kanal',contact_name:'Ahmet Kanal',street:'Testweg 1',postal_code:'10115',city:'Berlin',vat_id:'DE123',document_details:sellerSaved}};throw Error('Unexpected request '+path);};
try{
 await invoiceWindow.renderTradeModule();const d=invoiceWindow.document;d.querySelector('[data-add]').click();for(const [k,v]of Object.entries({name:'Buyer',street:'Stromstraße 56',postalCode:'10551',city:'Berlin'}))d.getElementById('trade-'+k).value=v;
 assert.equal(d.querySelector('[data-preview]').textContent,'Rechnung');await d.querySelector('[data-preview]').onclick();
 const sheet=d.querySelector('.trade-invoice-sheet');assert(sheet);assert.equal(sheet.querySelector('header,footer'),null);assert.equal(sheet.querySelector('input[placeholder="Artikel suchen …"]'),null);assert.equal(sheet.querySelector('.trade-sheet-seller'),null);assert.match(sheet.querySelector('.trade-sheet-return').textContent,/Ahmet Kanal · Testweg 1 · 10115 Berlin/);assert(!sheet.textContent.includes('ahmet.kanal'));assert.match(sheet.textContent,/Rechnungsentwurf/);assert.match(sheet.textContent,/nach bestätigter Barzahlung/);assert.match(sheet.textContent,/Musterbank/);assert.match(sheet.textContent,/DE89370400440532013000/);assert.match(sheet.textContent,/2,50/);
 const address=sheet.querySelector('[data-sheet-address]');assert.equal(address.style.getPropertyValue('--postcode-width'),'5ch');assert.equal(address.querySelector('[data-address-field="postalCode"]').value,'10551');assert.equal(address.querySelector('[data-address-field="city"]').value,'Berlin');
 address.querySelector('[data-address-field="city"]').value='Hamburg';address.querySelector('[data-address-field="city"]').dispatchEvent(new invoiceWindow.Event('input'));assert.equal(d.getElementById('trade-city').value,'Hamburg');
 assert(!invoiceCalls.some(c=>c.method!=='GET'));assert.equal(invoiceWindow.localStorage.getItem(key),null);
 d.querySelector('dialog button').click();
 // Preview reconciles merchandise, grouped deposits and return credits independently.
 for(const credit of [0,20,100]){
  invoiceWindow.bnDepositTotal=()=>75-credit;
  invoiceWindow.bnDepositBreakdown=()=>[
   {label:'Pfand Artikel A',qty:1,unitCents:25,totalCents:25},
   {label:'Pfand Artikel B',qty:1,unitCents:25,totalCents:25},
   {label:'Pfand Kiste',qty:1,unitCents:25,totalCents:25},
   ...(credit?[{label:'Pfandrückgabe verrechnet',qty:1,unitCents:-credit,totalCents:-credit}]:[])
  ];
  await d.querySelector('[data-preview]').onclick();
  const preview=d.querySelector('.trade-invoice-sheet'),rows=preview.querySelectorAll('tbody tr');
  assert.equal(rows.length,credit?3:2);assert.equal(rows[1].cells[1].textContent,'Pfand');assert.equal(rows[1].cells[2].textContent,'3');assert.match(rows[1].cells[4].textContent,/0,75/);
  assert(!preview.querySelector('.trade-sheet-total').textContent.includes('Rabatt'));
  const expected=((325-credit)/100).toFixed(2).replace('.',',');
  assert(preview.querySelector('.trade-sheet-total').textContent.includes(expected));assert(d.querySelector('[data-confirm-payment]').textContent.includes(expected));
  if(credit)assert.equal(rows[2].cells[1].textContent,'Pfandrückgabe verrechnet');
  assert(!invoiceCalls.some(c=>c.method!=='GET'));assert.equal(invoiceWindow.localStorage.getItem(key),null);
  d.querySelector('dialog button').click();
 }
 delete invoiceWindow.bnDepositTotal;delete invoiceWindow.bnDepositBreakdown;
 const sellerBox=d.querySelector('.trade-seller-details');sellerBox.open=true;await sellerBox.ontoggle();
 sellerBox.querySelector('[data-seller=iban]').value='DE021234';sellerBox.querySelector('[data-seller=bic]').value='10050000';await sellerBox.querySelector('button').onclick();assert.match(sellerBox.querySelector('[data-seller-status]').textContent,/Nicht gespeichert: IBAN/);assert.equal(sellerBox.querySelector('[data-seller=iban]').getAttribute('aria-invalid'),'true');assert.equal(sellerSaved.iban,'DE89370400440532013000');
 sellerBox.querySelector('[data-seller=iban]').value='DE89370400440532013000';await sellerBox.querySelector('button').onclick();assert.match(sellerBox.querySelector('[data-seller-status]').textContent,/BIC/);assert.equal(sellerBox.querySelector('[data-seller=bic]').getAttribute('aria-invalid'),'true');
 sellerBox.querySelector('[data-seller=bic]').value='COBADEFFXXX';sellerBox.querySelector('[data-seller=phone]').value='0301234567';sellerBox.querySelector('[data-seller=email]').value='seller@example.test';await sellerBox.querySelector('button').onclick();assert.match(sellerBox.querySelector('[data-seller-status]').textContent,/dauerhaft gespeichert/);const reloaded=await invoiceWindow.api('/billing/profile');assert.equal(reloaded.profile.document_details.phone,'0301234567');assert.equal(reloaded.profile.document_details.email,'seller@example.test');
 let releaseSeller;const sellerApi=invoiceWindow.api;invoiceWindow.api=(path,opt)=>path==='/billing/document-details'?new Promise(resolve=>releaseSeller=()=>sellerApi(path,opt).then(resolve)):sellerApi(path,opt);
 const pendingSeller=sellerBox.querySelector('button').onclick();for(let n=0;n<8&&!releaseSeller;n++)await new Promise(r=>setTimeout(r,0));sellerBox.querySelector('[data-seller=phone]').value='030999999';releaseSeller();await pendingSeller;assert.equal(sellerBox.querySelector('[data-seller=phone]').value,'030999999');assert.equal(sellerSaved.phone,'0301234567');assert.match(sellerBox.querySelector('[data-seller-status]').textContent,/Neue Änderungen sind noch nicht gespeichert/);invoiceWindow.api=sellerApi;await sellerBox.querySelector('button').onclick();assert.equal(sellerSaved.phone,'030999999');
 assert.equal(d.querySelector('.bn-sale-tools').hidden,true);
 d.getElementById('trade-email').value='buyer@example.test';d.getElementById('trade-phone').value='03012345';d.getElementById('trade-taxNumber').value='98/765';
 let paidBody,invoiceLoads=0;const receiptId=crypto.randomUUID();const previousApi=invoiceWindow.api;
 invoiceWindow.api=async(path,opt)=>{if(path.startsWith('/delivery-notes?'))return {deliveryNotes:[]};if(path.startsWith('/trade/invoices?'))return {invoices:[{id:receiptId,receipt_number:'HR-2026-000042',issued_at:new Date().toISOString(),total_cents:250}]};if(path==='/orders/checkout'){paidBody=JSON.parse(opt.body);return {receiptId,receiptNumber:'HR-2026-000042',requestKey:paidBody.requestKey,restaurantId:rid,status:'paid',totalCents:250};}return previousApi(path,opt);};
 invoiceWindow.fetch=async url=>{assert.equal(url,'/api/v1/receipts/'+receiptId+'/invoice');invoiceLoads++;return {ok:true,blob:async()=>new invoiceWindow.Blob(['%PDF-fixture'],{type:'application/pdf'})};};
 invoiceWindow.URL.createObjectURL=()=> 'blob:https://pos.test/invoice';invoiceWindow.URL.revokeObjectURL=()=>{};
 await d.querySelector('[data-preview]').onclick();assert.match(d.querySelector('[data-confirm-payment]').textContent,/Barzahlung erhalten/);await d.querySelector('[data-confirm-payment]').onclick();assert.equal(paidBody.recipient.email,'buyer@example.test');assert.equal(paidBody.recipient.phone,'03012345');assert.equal(paidBody.recipient.taxNumber,'98/765');assert.equal(invoiceLoads,1);
 assert(d.querySelector('.trade-issued-invoice').open);assert.match(d.querySelector('.trade-issued-invoice strong').textContent,/HR-2026-000042/);assert.match(d.querySelector('.trade-issued-invoice iframe').title,/Gespeicherte Rechnung/);assert.equal(d.getElementById('tradeArchive'),null);assert.equal(d.getElementById('tradeInvoices'),null);assert.equal(invoiceWindow.localStorage.getItem(key),null);
 d.querySelector('.trade-issued-invoice button').click();await d.querySelector('[data-archive]').onclick();assert.match(d.querySelector('[data-invoice-archive]').textContent,/HR-2026-000042/);await d.querySelector('[data-invoice-archive] button').onclick();assert.equal(invoiceLoads,2);
 console.log('Invoice draft UI passed: editable compact postcode/city, seller address and bank footer, tier prices and no payment, delivery issuance or number allocation.');
}finally{invoiceWindow.close()}

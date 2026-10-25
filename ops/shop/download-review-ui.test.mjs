import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {mountDownloadReview} from '../../apps/web/public/shop/download-review-ui.js';
import {downloadReviewLocation,downloadReviewHref,downloadReviewData,downloadInvoiceViewData} from '../../apps/web/public/shop/download-review-view.js';
import {invoiceSample} from './download-invoice-fixture.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const id=crypto.randomUUID(),flags={canPay:false,canActivate:false,checkoutConnected:false};
function data(){const s=invoiceSample();return {id,...flags,version:'pdf-domestic-b2b-v1',text:'Ich stimme der elektronischen Rechnung im PDF-Format ausdrücklich zu.',accepted:false,digest:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),seller:s.seller,buyer:s.buyer,product:s.product};}
async function waitFor(fn){const end=Date.now()+3000;while(!fn()){assert.ok(Date.now()<end,'UI result timed out');await new Promise(r=>setTimeout(r,5));}}
function setup(overrides={},options={}){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://fixture.example.test/shop/download-review.html'}),w=dom.window,host=w.document.getElementById('host');let token='owner-a',prints=0;const calls=[];
 const client={invalidate(){calls.push('invalidate');},async readConsent(){calls.push('read');return data();},async acceptConsent(view,options){calls.push({write:options.accepted,digest:view.digest});return {id,...flags,recorded:true};},async readReceipt(){calls.push('receipt');return {id,...flags,recorded:false};},async readStatus(){calls.push('status');return {id,...flags,status:'prepared',paymentMode:'none',licence:'blocked',invoicePreviewAvailable:false};},...overrides};
 const mounted=mountDownloadReview({host,id,client,getToken:()=>token,print:()=>prints++,...options});
 const click=label=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);b.click();};
 const settle=()=>waitFor(()=>mounted.root.getAttribute('aria-busy')==='false');
 return {w,host,client,calls,click,settle,mounted,setToken:value=>token=value,prints:()=>prints,cleanup(){mounted.dispose();w.close();}};
}
test('navigation binds only a checkout UUID in the fragment and rejects extra parameters',()=>{
 assert.equal(downloadReviewLocation('#checkout='+id),id);assert.equal(downloadReviewHref(id),'/shop/download-review.html#checkout='+id);
 for(const hash of ['', '#token=secret','#checkout=bad','#checkout='+id+'&checkout='+id,'#checkout='+id+'&token=secret'])assert.equal(downloadReviewLocation(hash),null);
 assert.throws(()=>downloadReviewHref('bad'));const d=data();assert.equal(downloadReviewData(d,id).product.grossCents,47481);
 for(const patch of [{id:crypto.randomUUID()},{canActivate:true},{product:{...d.product,grossCents:1}},{buyer:{...d.buyer,country:'FR'}}])assert.throws(()=>downloadReviewData({...d,...patch},id));
 const s=invoiceSample();s.checkoutId=id;const v={id,...flags,kind:'invoice_preview',snapshot:s,invoiceDelivered:false};assert.equal(downloadInvoiceViewData(v,id).invoiceNumber,s.invoiceNumber);assert.throws(()=>downloadInvoiceViewData({...v,snapshot:{...s,invoiceDate:'2026-02-30'}},id));
});
test('full data is visible before explicit unchecked consent and no action runs on mount',async()=>{
 const f=setup();try{
  assert.deepEqual(f.calls,[]);f.click('Rechnungsdaten laden');await f.settle();
  for(const value of ['SYNTHETISCHER ANBIETER','SYNTHETISCHER EMPFÄNGER','399,00','75,81','474,81','Bestätigung möglich bis'])assert.ok(f.host.textContent.includes(value));
  const box=f.host.querySelector('input[type=checkbox]'),form=f.host.querySelector('form'),save=form.querySelector('button');assert.equal(box.checked,false);assert.equal(save.disabled,true);form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));assert.equal(f.calls.length,2);
  box.checked=true;box.dispatchEvent(new f.w.Event('change'));assert.equal(save.disabled,false);form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));await f.settle();assert.equal(f.calls.filter(c=>c?.write).length,1);assert.match(f.host.textContent,/Rechnungsformat bestätigt/);assert.equal(form.hidden,true);
 }finally{f.cleanup();}
});
test('server text is rendered safely and an unsupported/malformed response never enables agreement',async()=>{
 const hostile=data();hostile.seller.name='<img src=x onerror=alert(1)>';const f=setup({readConsent:async()=>hostile});try{f.click('Rechnungsdaten laden');await f.settle();assert.equal(f.host.querySelectorAll('img,script,iframe').length,0);assert.ok(f.host.textContent.includes(hostile.seller.name));}finally{f.cleanup();}
 const broken=setup({readConsent:async()=>({...data(),canActivate:true})});try{broken.click('Rechnungsdaten laden');await broken.settle();assert.equal(broken.host.querySelector('form').hidden,true);assert.equal(broken.host.querySelector('form button').disabled,true);}finally{broken.cleanup();}
});
test('uncertain write clears agreement; recovery finds the stored receipt without another write',async()=>{
 let writes=0;const d=data(),f=setup({acceptConsent:async()=>{writes++;throw Object.assign(Error('private network details'),{code:'REQUEST_UNCERTAIN'});},readReceipt:async()=>writes?({...d,recorded:true,acceptedAt:new Date().toISOString()}):({id,...flags,recorded:false})});try{
  f.click('Rechnungsdaten laden');await f.settle();const box=f.host.querySelector('input');box.checked=true;box.dispatchEvent(new f.w.Event('change'));f.host.querySelector('form').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await f.settle();assert.match(f.host.textContent,/zuerst den gespeicherten Nachweis/);assert.equal(f.host.querySelector('form').hidden,true);
  f.click('Gespeicherten Nachweis prüfen');await f.settle();assert.match(f.host.textContent,/Gespeicherte Zustimmung/);assert.match(f.host.textContent,/erneute Bestätigung ist nicht erforderlich/);assert.equal(writes,1);assert.equal(f.host.textContent.includes('private'),false);
 }finally{f.cleanup();}
});
test('account/visibility/offline reset removes personal data and never replays work on reconnect',async()=>{
 const f=setup();try{
  f.click('Rechnungsdaten laden');await f.settle();f.setToken('owner-b');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(f.host.textContent.includes('SYNTHETISCHER ANBIETER'),false);assert.equal(f.host.querySelector('input').checked,false);
  const count=f.calls.length;Object.defineProperty(f.w.navigator,'onLine',{value:false,configurable:true});f.w.dispatchEvent(new f.w.Event('offline'));assert.equal(f.host.querySelector('button').disabled,true);
  Object.defineProperty(f.w.navigator,'onLine',{value:true,configurable:true});f.w.dispatchEvent(new f.w.Event('online'));assert.equal(f.calls.length,count+1);assert.equal(f.host.querySelector('input').checked,false);
  f.click('Rechnungsdaten laden');await f.settle();Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.host.textContent.includes('SYNTHETISCHER ANBIETER'),false);assert.equal(f.host.querySelector('form').hidden,true);
 }finally{f.cleanup();}
});
test('late account response and removed host cannot restore personal data',async()=>{
 let resolve;const f=setup({readConsent:()=>new Promise(r=>resolve=r)});try{f.click('Rechnungsdaten laden');await waitFor(()=>typeof resolve==='function');f.setToken('owner-b');resolve(data());await waitFor(()=>f.host.textContent.includes('Konto hat gewechselt'));assert.equal(f.host.textContent.includes('SYNTHETISCHER ANBIETER'),false);}finally{f.cleanup();}
 const g=setup();g.host.replaceChildren();await new Promise(r=>setTimeout(r,0));assert.equal(g.mounted.root.childElementCount,0);g.cleanup();
});
test('stored paid status never becomes completed and historical preview prints only on explicit action',async()=>{
 const s=invoiceSample();s.checkoutId=id;const f=setup({readStatus:async()=>({id,...flags,status:'paid',paymentMode:'test',licence:'blocked',invoicePreviewAvailable:true}),readInvoicePreview:async()=>({id,...flags,kind:'invoice_preview',snapshot:s,invoiceDelivered:false})});try{
  f.click('Kaufstatus prüfen');await f.settle();assert.match(f.host.textContent,/Lizenz weiterhin gesperrt/);assert.match(f.host.textContent,/TEST-Vorgang/);assert.equal(f.host.querySelector('[data-shop-status=completed]'),null);
  f.click('Rechnungsvorschau laden');await f.settle();assert.match(f.host.textContent,/keine ausgestellte Rechnung/);assert.equal(f.prints(),0);f.click('Vorschau drucken');assert.equal(f.prints(),1);
  f.setToken('owner-b');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));f.click('Vorschau drucken');assert.equal(f.prints(),1);assert.equal(f.host.querySelector('.download-invoice').childElementCount,0);
 }finally{f.cleanup();}
});
test('expired view cannot be submitted and read-only recovery remains available',async()=>{
 const f=setup({readConsent:async()=>({...data(),expiresAt:new Date(Date.now()+30).toISOString()})});try{f.click('Rechnungsdaten laden');await f.settle();await waitFor(()=>f.host.textContent.includes('Daten sind abgelaufen'));assert.equal(f.host.querySelector('form button').disabled,true);assert.equal(f.host.querySelector('input').checked,false);assert.equal([...f.host.querySelectorAll('button')].find(b=>b.textContent==='Gespeicherten Nachweis prüfen').disabled,false);}finally{f.cleanup();}
});
test('loading data first recovers an existing receipt and never offers another consent',async()=>{
 let newReads=0;const f=setup({readReceipt:async()=>({...data(),recorded:true,acceptedAt:new Date().toISOString()}),readConsent:async()=>{newReads++;return data();}});try{
  f.click('Rechnungsdaten laden');await f.settle();assert.equal(newReads,0);assert.equal(f.host.querySelector('form').hidden,true);assert.match(f.host.textContent,/erneute Bestätigung ist nicht erforderlich/);assert.equal(f.calls.filter(c=>c?.write).length,0);
 }finally{f.cleanup();}
});
test('a same-tab account change is checked before print even without a storage event',async()=>{
 const s=invoiceSample();s.checkoutId=id;const f=setup({readStatus:async()=>({id,...flags,status:'paid',paymentMode:'live',invoicePreviewAvailable:true}),readInvoicePreview:async()=>({id,...flags,kind:'invoice_preview',snapshot:s,invoiceDelivered:false})});try{
  f.click('Kaufstatus prüfen');await f.settle();f.click('Rechnungsvorschau laden');await f.settle();f.setToken('owner-b');f.click('Vorschau drucken');assert.equal(f.prints(),0);assert.equal(f.host.querySelector('.download-invoice').childElementCount,0);assert.match(f.host.textContent,/Konto hat gewechselt/);
 }finally{f.cleanup();}
});
test('PDF download is offered only after preview and runs only on explicit action',async()=>{
 const s=invoiceSample();s.checkoutId=id;let requests=0;const downloads=[],f=setup({readStatus:async()=>({id,...flags,status:'paid',paymentMode:'live',invoicePreviewAvailable:true}),readInvoicePreview:async()=>({id,...flags,kind:'invoice_preview',snapshot:s,digest:'a'.repeat(64),invoiceDelivered:false}),readInvoicePreviewPdf:async(_id,options)=>{requests++;assert.equal(options.expectedDigest,'a'.repeat(64));return {filename:'Bringness-Vorschau-BN-2026-001000.pdf',bytes:new Uint8Array(120)};}},{downloadPdf:file=>downloads.push(file)});try{
  assert.equal([...f.host.querySelectorAll('button')].find(b=>b.textContent==='Vorschau als PDF herunterladen').hidden,true);f.click('Kaufstatus prüfen');await f.settle();f.click('Rechnungsvorschau laden');await f.settle();assert.equal(requests,0);assert.equal(downloads.length,0);
  f.click('Vorschau als PDF herunterladen');await f.settle();assert.equal(requests,1);assert.equal(downloads.length,1);assert.match(f.host.textContent,/Keine ausgestellte oder zugestellte Rechnung/);
  f.setToken('owner-b');f.click('Vorschau als PDF herunterladen');assert.equal(requests,1);assert.equal(downloads.length,1);
 }finally{f.cleanup();}
});
test('late PDF response after account invalidation cannot start a download',async()=>{
 const s=invoiceSample();s.checkoutId=id;let resolve,downloads=0;const f=setup({readStatus:async()=>({id,...flags,status:'paid',paymentMode:'live',invoicePreviewAvailable:true}),readInvoicePreview:async()=>({id,...flags,kind:'invoice_preview',snapshot:s,digest:'a'.repeat(64),invoiceDelivered:false}),readInvoicePreviewPdf:()=>new Promise(r=>resolve=r)},{downloadPdf:()=>downloads++});try{
  f.click('Kaufstatus prüfen');await f.settle();f.click('Rechnungsvorschau laden');await f.settle();f.click('Vorschau als PDF herunterladen');f.setToken('owner-b');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));resolve({bytes:new Uint8Array(120),filename:'Bringness-Vorschau-BN-2026-001000.pdf'});await new Promise(r=>setTimeout(r,0));assert.equal(downloads,0);assert.equal(f.host.querySelector('.download-invoice').childElementCount,0);
 }finally{f.cleanup();}
});
test('archive actions remain hidden without explicit capability and require a loaded preview',async()=>{
 const f=setup();try{const buttons=[...f.host.querySelectorAll('button')].filter(b=>/dauerhaft speichern|Gespeicherte PDF/.test(b.textContent));assert.equal(buttons.length,2);assert.ok(buttons.every(b=>b.hidden&&b.disabled));f.click('Kaufstatus prüfen');await f.settle();assert.ok(buttons.every(b=>b.hidden));}finally{f.cleanup();}
});
test('archive save and saved download are separate explicit actions; account change removes both',async()=>{
 const s=invoiceSample();s.checkoutId=id;let saves=0,reads=0;const files=[],f=setup({readStatus:async()=>({id,...flags,status:'paid',paymentMode:'live',invoicePreviewAvailable:true,previewArchiveAvailable:true}),readInvoicePreview:async()=>({id,...flags,kind:'invoice_preview',snapshot:s,digest:'a'.repeat(64),invoiceDelivered:false}),archiveInvoicePreview:async()=>{saves++;},readArchivedInvoicePreviewPdf:async()=>{reads++;return {bytes:new Uint8Array(120),filename:'Bringness-Vorschau-BN-2026-001000.pdf'};}},{downloadPdf:file=>files.push(file)});try{f.click('Kaufstatus prüfen');await f.settle();f.click('PDF-Vorschau dauerhaft speichern');assert.equal(saves,0);f.click('Rechnungsvorschau laden');await f.settle();f.click('PDF-Vorschau dauerhaft speichern');await f.settle();assert.equal(saves,1);assert.equal(reads,0);f.click('Gespeicherte PDF-Vorschau herunterladen');await f.settle();assert.equal(reads,1);assert.equal(files.length,1);f.setToken('owner-b');f.click('PDF-Vorschau dauerhaft speichern');assert.equal(saves,1);assert.equal([...f.host.querySelectorAll('button')].find(b=>b.textContent==='PDF-Vorschau dauerhaft speichern').hidden,true);}finally{f.cleanup();}
});
test('lost archive acknowledgement points to saved PDF recovery and never automatically resends',async()=>{
 const s=invoiceSample();s.checkoutId=id;let saves=0,reads=0;const f=setup({readStatus:async()=>({id,...flags,status:'paid',invoicePreviewAvailable:true,previewArchiveAvailable:true}),readInvoicePreview:async()=>({id,...flags,kind:'invoice_preview',snapshot:s,digest:'a'.repeat(64),invoiceDelivered:false}),archiveInvoicePreview:async()=>{saves++;throw Object.assign(Error('lost'),{code:'REQUEST_UNCERTAIN'});},readArchivedInvoicePreviewPdf:async()=>{reads++;throw Object.assign(Error('missing'),{code:'PREVIEW_FILE_NOT_FOUND'});}});try{f.click('Kaufstatus prüfen');await f.settle();f.click('Rechnungsvorschau laden');await f.settle();f.click('PDF-Vorschau dauerhaft speichern');await f.settle();assert.match(f.host.textContent,/Prüfe zuerst „Gespeicherte PDF/);assert.equal(saves,1);assert.equal(reads,0);f.click('Gespeicherte PDF-Vorschau herunterladen');await f.settle();assert.equal(reads,1);assert.equal(saves,1);assert.match(f.host.textContent,/noch keine PDF-Vorschau gespeichert/);}finally{f.cleanup();}
});

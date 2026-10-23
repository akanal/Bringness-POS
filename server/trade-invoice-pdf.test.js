import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {renderTradeInvoice} from './trade-invoice-pdf.js';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';

test('trade invoice matches reference structure, real payment methods, net totals and multipage rows',async()=>{
 for(const count of [1,65]){
  const doc=new PDFDocument({size:'A4',margin:48});const chunks=[];
  const done=new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
  renderTradeInvoice(doc,{restaurant_name:'ahmet.kanal',billing_name:'ahmet.kanal',contact_name:'Ahmet Kanal',street:'Testweg 1',postal_code:'10115',city:'Berlin',vat_id:'DE123',document_details:{taxNumber:'12/345/67890',bankName:'Musterbank',iban:'DE89370400440532013000',bic:'COBADEFFXXX'},issued_at:'2026-10-18T10:00:00Z',receipt_number:'RE-1537',total_cents:29750*count,fiscal_status:'unsigned',recipient:{name:'Testkunde',street:'Kundenweg 2',postalCode:'18055',city:'Rostock',country:'Deutschland',vatId:'DE987654321',taxNumber:'98/765',email:'buyer@example.test',phone:'03012345'}},Array.from({length:count},(_,i)=>({product_id:String(i),product_name_snapshot:'Artikel '+(i+1),unit_price_cents:1190,tax_rate_snapshot:19,quantity:25})),[{method:count===1?'cash':'card',amount_cents:29750*count}]);
  doc.end();const bytes=await done;
  const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});const pdf=await loading.promise;
  let text='',images=0;for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);text+=(await page.getTextContent()).items.map(x=>x.str).join(' ');
   const operators=await page.getOperatorList();images+=operators.fnArray.filter(fn=>fn===OPS.paintImageXObject).length;
  }assert.equal(images,0,'A4 invoice contains no QR image');
  for(const label of ['Rechnungs-Nr.','Testkunde','Gesamtbetrag netto','Gesamtbetrag brutto','Umsatzsteuer 19 %',count===1?'Zahlungsart: Barzahlung':'Zahlungsart: Karte','Artikel '+count,'Steuer-Nr.: 12/345/67890','Musterbank','IBAN DE89370400440532013000','BIC COBADEFFXXX','USt-IdNr.: DE987654321','Steuer-Nr.: 98/765','buyer@example.test','Tel. 03012345'])assert(text.includes(label),label);
  assert(!text.includes('QR:'));assert(text.includes('RE-1537'));
  assert(text.includes('Ahmet Kanal'));assert(!text.includes('ahmet.kanal'));
  const firstPage=await pdf.getPage(1),firstText=(await firstPage.getTextContent()).items;assert(!firstText.some(x=>/Ahmet|kanal/i.test(x.str)&&firstPage.view[3]-x.transform[5]<100),'no seller name in upper-right header');const recipient=firstText.find(x=>x.str==='Testkunde');assert(recipient);const top=firstPage.view[3]-recipient.transform[5];assert(top>=140&&top<=158,'recipient stays in the envelope address zone');assert(firstText.some(x=>x.str==='18055 Rostock'),'postcode and city printed together');
  if(count===1){assert.equal(pdf.numPages,1);assert(text.includes('250,00 EUR'));assert(text.includes('47,50 EUR'));assert(text.includes('297,50 EUR'));}
  else assert(pdf.numPages>1);
  await loading.destroy();
 }
});

test('compact deposits preserve totals and keep the three-product sample on one page',async()=>{
 const doc=new PDFDocument({size:'A4',margin:48}),chunks=[];const done=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 const items=['Pizza','Hamburger','Cola'].map((name,i)=>({product_id:String(i),product_name_snapshot:name,unit_price_cents:i===1?699:799,tax_rate_snapshot:19,quantity:1000})).concat([{product_id:null,product_name_snapshot:'Pfand: Flasche',unit_price_cents:25,tax_rate_snapshot:0,quantity:1000}]);const before=JSON.stringify(items);
 renderTradeInvoice(doc,{receipt_number:'HR-2026-000001',issued_at:'2026-10-23T10:00:00Z',total_cents:2322000,fiscal_status:'unsigned',recipient:{name:'Testkunde'}},items,[{method:'cash',amount_cents:2322000}]);doc.end();const bytes=await done;
 const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),pdf=await loading.promise;assert.equal(pdf.numPages,1);const page=await pdf.getPage(1),text=(await page.getTextContent()).items,deposit=text.find(item=>item.str==='Pfand'),product=text.find(item=>item.str==='Pizza');assert(deposit.height<product.height);assert.notEqual(deposit.fontName,product.fontName);assert(text.map(item=>item.str).join(' ').includes('23.220,00 EUR'));assert.equal(JSON.stringify(items),before);await loading.destroy();
});

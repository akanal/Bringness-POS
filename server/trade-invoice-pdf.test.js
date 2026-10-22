import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {renderTradeInvoice} from './trade-invoice-pdf.js';
import {getDocument,OPS,Util} from 'pdfjs-dist/legacy/build/pdf.mjs';

test('trade invoice matches reference structure, real payment methods, net totals and multipage rows',async()=>{
 for(const count of [1,65]){
  const doc=new PDFDocument({size:'A4',margin:48});const chunks=[];
  const done=new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
  renderTradeInvoice(doc,{restaurant_name:'ahmet.kanal',billing_name:'ahmet.kanal',contact_name:'Ahmet Kanal',street:'Testweg 1',postal_code:'10115',city:'Berlin',vat_id:'DE123',document_details:{taxNumber:'12/345/67890',bankName:'Musterbank',iban:'DE89370400440532013000',bic:'COBADEFFXXX'},issued_at:'2026-10-18T10:00:00Z',receipt_number:'RE-1537',total_cents:29750*count,fiscal_status:'unsigned',recipient:{name:'Testkunde',street:'Kundenweg 2',postalCode:'18055',city:'Rostock',country:'Deutschland',vatId:'DE987654321',taxNumber:'98/765',email:'buyer@example.test',phone:'03012345'}},Array.from({length:count},(_,i)=>({product_id:String(i),product_name_snapshot:'Artikel '+(i+1),unit_price_cents:1190,tax_rate_snapshot:19,quantity:25})),[{method:count===1?'cash':'card',amount_cents:29750*count}],await QRCode.toBuffer('https://example.org/receipt/test'));
  doc.end();const bytes=await done;
  const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});const pdf=await loading.promise;
  let text='',qrImages=0;for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);text+=(await page.getTextContent()).items.map(x=>x.str).join(' ');
   const operators=await page.getOperatorList();let matrix=[1,0,0,1,0,0];const stack=[];
   for(let n=0;n<operators.fnArray.length;n++){
    const fn=operators.fnArray[n],args=operators.argsArray[n];
    if(fn===OPS.save)stack.push([...matrix]);else if(fn===OPS.restore)matrix=stack.pop();else if(fn===OPS.transform)matrix=Util.transform(matrix,args);
    else if(fn===OPS.paintImageXObject){qrImages++;const left=matrix[4],right=matrix[4]+matrix[0];assert(Math.abs((left+right)/2-page.view[2]/2)<1,'QR stays horizontally centered in the generated PDF');assert(Math.abs(matrix[0])>=65,'QR remains large enough to scan');}
   }
  }assert.equal(qrImages,1,'each issued invoice contains its QR exactly once');
  for(const label of ['Rechnungs-Nr.','Testkunde','Gesamtbetrag netto','Gesamtbetrag brutto','Umsatzsteuer 19 %',count===1?'Zahlungsart: Barzahlung':'Zahlungsart: Karte','Artikel '+count,'QR: Diese Rechnung öffnen','Steuer-Nr.: 12/345/67890','Musterbank','IBAN DE89370400440532013000','BIC COBADEFFXXX','USt-IdNr.: DE987654321','Steuer-Nr.: 98/765','buyer@example.test','Tel. 03012345'])assert(text.includes(label),label);
  assert(text.includes('Ahmet Kanal'));assert(!text.includes('ahmet.kanal'));
  const firstPage=await pdf.getPage(1),firstText=(await firstPage.getTextContent()).items;assert(!firstText.some(x=>/Ahmet|kanal/i.test(x.str)&&firstPage.view[3]-x.transform[5]<100),'no seller name in upper-right header');const recipient=firstText.find(x=>x.str==='Testkunde');assert(recipient);const top=firstPage.view[3]-recipient.transform[5];assert(top>=140&&top<=158,'recipient stays in the envelope address zone');assert(firstText.some(x=>x.str==='18055 Rostock'),'postcode and city printed together');
  if(count===1){assert.equal(pdf.numPages,1);assert(text.includes('250,00 EUR'));assert(text.includes('47,50 EUR'));assert(text.includes('297,50 EUR'));}
  else assert(pdf.numPages>1);
  await loading.destroy();
 }
});

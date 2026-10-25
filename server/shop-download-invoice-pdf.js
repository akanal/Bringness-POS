import crypto from 'node:crypto';
import {shopInvoiceQr} from './shop-invoice-qr.js';
import {readFileSync} from 'node:fs';
import {shopError} from './shop-account.js';
import {downloadInvoiceModel,downloadInvoiceDigest} from './shop-download-invoice.js';

const assets=new URL('./assets/shop-invoice-fonts/',import.meta.url),maxBytes=2*1024*1024;
function fonts(){
 try{const manifest=JSON.parse(readFileSync(new URL('manifest.json',assets))),result={};
  for(const name of ['DejaVuSans.ttf','DejaVuSans-Bold.ttf']){const bytes=readFileSync(new URL(name,assets)),entry=manifest[name];if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error();result[name]={bytes,coverage:entry.coverage};}return result;
 }catch{throw shopError('PDF_FONT_UNAVAILABLE');}
}
function checkText(model,loaded){
 const values=[...Object.values(model.seller),...Object.values(model.buyer),model.description];
 for(const value of values)for(const ch of value.normalize('NFC')){
  const cp=ch.codePointAt(0);
  // Complex RTL/bidi layout is deliberately unsupported, never silently printed
  // in a misleading order. Missing glyphs fail before any bytes are returned.
  if(/[\p{Cf}\p{Cs}\p{Script=Arabic}\p{Script=Hebrew}]/u.test(ch)||Object.values(loaded).some(font=>!font.coverage.some(([a,b])=>cp>=a&&cp<=b)))throw shopError('PDF_TEXT_UNSUPPORTED');
 }
}
export async function renderShopDownloadInvoicePreviewPdf(snapshot,{PDFDocument,publicOrigin,qrEncoder}={}){
 const model=downloadInvoiceModel(snapshot),loaded=fonts();checkText(model,loaded);
 const qr=publicOrigin===undefined?null:await shopInvoiceQr(publicOrigin,model.checkoutId,{encoder:qrEncoder});
 if(!PDFDocument){try{PDFDocument=(await import('pdfkit')).default;}catch{throw shopError('PDF_UNAVAILABLE');}}
 let doc;try{doc=new PDFDocument({autoFirstPage:false,bufferPages:true,size:'A4',margin:45,pdfVersion:'1.7',compress:true,info:{Title:'Bringness Rechnungsvorschau '+model.invoiceNumber,Author:'Bringness',Subject:'VORSCHAU - KEINE AUSGESTELLTE RECHNUNG',Creator:'Bringness Shop Preview',Producer:'Bringness Shop Preview',CreationDate:new Date(model.invoiceDate+'T00:00:00Z'),ModDate:new Date(model.invoiceDate+'T00:00:00Z')}});}catch{throw shopError('PDF_UNAVAILABLE');}
 const chunks=[];let size=0;const ready=new Promise((resolve,reject)=>{doc.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){doc.destroy(shopError('PDF_TOO_LARGE'));return;}chunks.push(chunk);});doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 try{
  doc.registerFont('regular',loaded['DejaVuSans.ttf'].bytes);doc.registerFont('bold',loaded['DejaVuSans-Bold.ttf'].bytes);
  const left=45,width=505,bottom=738;let y=0,pages=0;
  const font=(bold,size)=>doc.font(bold?'bold':'regular').fontSize(size).fillColor('#111111');
  function newPage(){if(++pages>20)throw shopError('PDF_TOO_LARGE');doc.addPage();font(true,10).text('VORSCHAU - KEINE AUSGESTELLTE RECHNUNG',left,34,{width,lineBreak:false});font(false,8).text('Bringness | '+model.invoiceNumber,left,51,{width,lineBreak:false});doc.moveTo(left,68).lineTo(left+width,68).strokeColor('#777777').stroke();y=88;}
  function room(height){if(y+height>bottom)newPage();}
  function wrap(value,{size=10,bold=false,available=width}={}){
   font(bold,size);const lines=[];let line='';
   for(const word of String(value).normalize('NFC').split(/\s+/).filter(Boolean)){
    if(doc.widthOfString((line?line+' ':'')+word)<=available){line+=(line?' ':'')+word;continue;}
    if(line){lines.push(line);line='';}
    for(const char of word){if(line&&doc.widthOfString(line+char)>available){lines.push(line);line='';}line+=char;}
   }
   if(line)lines.push(line);return lines;
  }
  function paragraph(value,{size=10,bold=false,after=4}={}){const lines=wrap(value,{size,bold}),height=size*1.45;for(const line of lines){room(height);font(bold,size).text(line,left,y,{width,lineBreak:false});y+=height;}y+=after;}
  function section(title){room(42);y+=8;paragraph(title,{size:12,bold:true,after:6});}
  const date=value=>value.split('-').reverse().join('.'),euro=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(value/100);
  newPage();paragraph('Rechnungsvorschau',{size:20,bold:true,after:9});paragraph('Gespeicherte Nummer: '+model.invoiceNumber);paragraph('Rechnungsdatum: '+date(model.invoiceDate));paragraph('Leistungsdatum: '+date(model.serviceDate));
  section('Anbieter');for(const line of [model.seller.name,model.seller.street,model.seller.postalCode+' '+model.seller.city,model.seller.country])paragraph(line);paragraph('Steuernummer / USt-IdNr.: '+model.seller.taxId,{size:9});
  section('Rechnungsempfänger');for(const line of [model.buyer.company_name,model.buyer.street,model.buyer.postal_code+' '+model.buyer.city,model.buyer.country])paragraph(line);
  section('Leistung');paragraph(model.description.replaceAll('–','-'));paragraph('Menge: 1 | einmalige Basislizenz');
  room(98);y+=10;doc.moveTo(left,y).lineTo(left+width,y).strokeColor('#777777').stroke();y+=12;
  for(const [label,value,bold]of [['Netto',model.product.netCents,false],['Umsatzsteuer 19 %',model.product.vatCents,false],['Gesamt',model.product.grossCents,true]]){font(bold,11).text(label,left,y,{width:330,lineBreak:false});font(bold,11).text(euro(value),left+335,y,{width:170,align:'right',lineBreak:false});y+=24;}
  y+=10;paragraph('Diese Vorschau ist keine ausgestellte oder zugestellte Rechnung. Keine Zahlungsaufforderung und keine Lizenzfreigabe.',{size:9});
  if(qr){
   room(150);const unit=2,total=(qr.size+qr.quietZone*2)*unit;
   if(total>130)throw shopError('INVOICE_QR_UNAVAILABLE');
   doc.save().fillColor('#ffffff').rect(left,y,total,total).fill();
   doc.fillColor('#000000');
   for(let row=0;row<qr.size;row++)for(let col=0;col<qr.size;col++)if(qr.data[row*qr.size+col])doc.rect(left+(col+4)*unit,y+(row+4)*unit,unit,unit);
   doc.fill().restore();font(false,9).text('Rechnungsvorschau im eigenen Shop-Konto öffnen. Anmeldung erforderlich.',left+total+12,y+8,{width:width-total-12});
   y+=total+10;
  }
  const range=doc.bufferedPageRange();for(let page=0;page<range.count;page++){doc.switchToPage(page);font(false,8).text(`Seite ${page+1} von ${range.count} | Vorschau - keine ausgestellte Rechnung`,left,786,{width,align:'center',lineBreak:false});}
  doc.end();return await ready;
 }catch(e){doc.destroy(e);await ready.catch(()=>{});throw e.code?e:shopError('PDF_UNAVAILABLE');}
}
export function shopDownloadInvoicePdfResponse(snapshot,bytes){
 const model=downloadInvoiceModel(snapshot);
 if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>maxBytes||bytes.subarray(0,8).toString()!=='%PDF-1.7')throw shopError('PDF_UNAVAILABLE');
 const filename='Bringness-Vorschau-'+model.invoiceNumber+'.pdf';
 return {status:200,body:bytes,headers:{'Content-Type':'application/pdf','Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox",'X-Shop-Invoice-Source-Digest':downloadInvoiceDigest(model),'X-Shop-Pdf-Sha256':crypto.createHash('sha256').update(bytes).digest('hex')}};
}

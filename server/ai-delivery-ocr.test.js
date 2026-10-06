import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import {recognizeDocument} from './ai-delivery-notes.js';
test('German photo OCR and blank photo warning without online model downloads',async()=>{
 const c=createCanvas(1400,800),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1400,800);x.fillStyle='black';x.font='44px sans-serif';['Lieferschein 123456','Lieferant Berlin','Mehl 3 kg','Milch 2 Liter'].forEach((s,i)=>x.fillText(s,80,100+i*110));const r=await recognizeDocument(c.toBuffer('image/png'),'image/png');assert.equal(r.readable,true);assert.match(r.text,/Mehl/);assert(r.lines.every(l=>l.reviewed===false));x.fillStyle='white';x.fillRect(0,0,1400,800);const blank=await recognizeDocument(c.toBuffer('image/png'),'image/png');assert.equal(blank.readable,false);assert.match(blank.warning,/erneut/);
});
test('text PDF and scanned PDF are both read',async()=>{
 const c=createCanvas(1100,600),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1100,600);x.fillStyle='black';x.font='44px sans-serif';['Lieferschein 987654','Lieferant Berlin','Mehl 3 kg'].forEach((s,i)=>x.fillText(s,70,100+i*100));
 for(const scan of [false,true]){const bytes=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));if(scan)doc.image(c.toBuffer('image/png'),20,40,{width:570});else doc.fontSize(20).text('Lieferschein 123456\nLieferant Berlin\nMehl 3 kg');doc.end();});const r=await recognizeDocument(bytes,'application/pdf');assert.equal(r.readable,true);assert.match(r.text,/Mehl/);}
});

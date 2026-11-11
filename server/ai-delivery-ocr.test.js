import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCanvas} from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import {recognizeDocument} from './ai-delivery-notes.js';
test('German photo OCR and blank photo warning without online model downloads',async()=>{
 // Fixed synthetic pixels keep this real OCR test independent of runner fonts.
 const photo=await readFile(new URL('./fixtures/ocr/delivery-photo.png',import.meta.url));
 const r=await recognizeDocument(photo,'image/png');assert.equal(r.readable,true,JSON.stringify({text:r.text,confidence:r.confidence}));assert.match(r.text,/Mehl/);assert(r.lines.every(l=>l.reviewed===false));const c=createCanvas(1400,800),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1400,800);const blank=await recognizeDocument(c.toBuffer('image/png'),'image/png');assert.equal(blank.readable,false);assert.match(blank.warning,/erneut/);
});
test('text PDF and scanned PDF are both read',async()=>{
 const scanImage=await readFile(new URL('./fixtures/ocr/delivery-scan.png',import.meta.url));
 for(const scan of [false,true]){const bytes=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));if(scan)doc.image(scanImage,20,40,{width:570});else doc.fontSize(20).text('Lieferschein 123456\nLieferant Berlin\nMehl 3 kg');doc.end();});const r=await recognizeDocument(bytes,'application/pdf');assert.equal(r.readable,true,JSON.stringify({text:r.text,confidence:r.confidence}));assert.match(r.text,/Mehl/);}
});

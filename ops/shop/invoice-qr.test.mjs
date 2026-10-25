import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {shopInvoiceReviewUrl,shopInvoiceQr} from '../../server/shop-invoice-qr.js';
import {downloadReviewLocation} from '../../apps/web/public/shop/download-review-view.js';
import {renderShopDownloadInvoicePreviewPdf} from '../../server/shop-download-invoice-pdf.js';
import {invoiceSample} from './download-invoice-fixture.mjs';
const require=createRequire(import.meta.url),encoder=require('qrcode'),PDFDocument=require('pdfkit');
test('invoice QR contains only a validated HTTPS review reference compatible with the existing page',async()=>{
 const s=invoiceSample(),url=shopInvoiceReviewUrl('https://fixture.example.test',s.checkoutId);
 assert.equal(downloadReviewLocation(new URL(url).hash),s.checkoutId);
 assert.equal(new URL(url).search,'');assert.equal(new URL(url).pathname,'/shop/download-review.html');
 assert.equal(url.includes(s.buyer.company_name),false);
 const qr=await shopInvoiceQr('https://fixture.example.test',s.checkoutId,{encoder});
 const expected=encoder.create(url,{errorCorrectionLevel:'M'});
 assert.deepEqual(qr.data,Array.from(expected.modules.data));assert.equal(qr.quietZone,4);
});
test('unsafe origins and malformed references never become invoice links',()=>{
 for(const origin of ['http://example.test','https://user:pass@example.test','https://example.test/path','https://example.test?x=1','https://example.test/','https://example.test:444',undefined])assert.throws(()=>shopInvoiceReviewUrl(origin,invoiceSample().checkoutId),{code:'INVALID_PUBLIC_ORIGIN'});
 for(const id of ['bad','../invoice','123#token=secret'])assert.throws(()=>shopInvoiceReviewUrl('https://example.test',id),{code:'INVALID_REQUEST'});
});
test('QR encoder failures and malformed matrices fail closed',async()=>{
 for(const encoder of [{create(){throw Error('private details');}},{create(){return {modules:{size:21,data:[]}};}},{create(){return {modules:{size:21,data:Array(441).fill(2)}};}}])await assert.rejects(shopInvoiceQr('https://example.test',invoiceSample().checkoutId,{encoder}),{code:'INVOICE_QR_UNAVAILABLE'});
});
test('PDF includes deterministic vector QR without provider requests or active links',async()=>{
 const s=invoiceSample(),options={PDFDocument,publicOrigin:'https://fixture.example.test',qrEncoder:encoder};
 const a=await renderShopDownloadInvoicePreviewPdf(s,options),b=await renderShopDownloadInvoicePreviewPdf(s,options);
 assert.deepEqual(a,b);assert.ok(a.length>100);assert.equal(a.includes(Buffer.from('/URI')),false);assert.equal(a.includes(Buffer.from('/JavaScript')),false);
 await assert.rejects(renderShopDownloadInvoicePreviewPdf(s,{...options,publicOrigin:'http://unsafe.test'}),{code:'INVALID_PUBLIC_ORIGIN'});
});

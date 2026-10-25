import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {createPreviewPdfDownload} from '../../apps/web/public/shop/download-pdf-file.js';
import {createDownloadReviewClient} from '../../apps/web/public/shop/download-review-client.js';
import {invoiceSample} from './download-invoice-fixture.mjs';
import {pdfRenderer} from './download-pdf-fixture.mjs';
import {downloadInvoiceDigest} from '../../server/shop-download-invoice.js';
import {shopDownloadInvoicePdfResponse} from '../../server/shop-download-invoice-pdf.js';

const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));

test('download URLs are transient, filenames are fixed and clearing revokes every URL',()=>{
 const dom=new JSDOM('<body></body>'),w=dom.window,created=[],revoked=[],clicks=[];w.URL.createObjectURL=blob=>{created.push(blob);return 'blob:synthetic-'+created.length;};w.URL.revokeObjectURL=url=>revoked.push(url);w.HTMLAnchorElement.prototype.click=function(){clicks.push({href:this.href,download:this.download});};
 const download=createPreviewPdfDownload({window:w,document:w.document}),file={bytes:new Uint8Array(120),filename:'Bringness-Vorschau-BN-2026-001000.pdf'};
 try{download.save(file);assert.equal(created.length,1);assert.equal(created[0].type,'application/pdf');assert.equal(clicks[0].download,file.filename);assert.equal(w.document.querySelectorAll('a').length,0);download.clear();assert.deepEqual(revoked,['blob:synthetic-1']);download.save(file);download.clear();assert.deepEqual(revoked,['blob:synthetic-1','blob:synthetic-2']);assert.throws(()=>download.save({...file,filename:'../other.pdf'}),{code:'PDF_DOWNLOAD_UNAVAILABLE'});}finally{download.clear();w.close();}
});
test('a PDF request is single flight and a late result after account change is discarded',async()=>{
 const s=invoiceSample(),id=s.checkoutId,digest=downloadInvoiceDigest(s),bytes=await pdfRenderer(s),response=shopDownloadInvoicePdfResponse(s,bytes),preview={id,kind:'invoice_preview',snapshot:s,digest,invoiceDelivered:false,canPay:false,canActivate:false,checkoutConnected:false};let token='account-a',resolve,calls=0;
 const client=createDownloadReviewClient({getToken:()=>token,fetcher:async url=>{calls++;if(!url.endsWith('.pdf'))return Response.json(preview);return new Promise(r=>resolve=r);}});await client.readInvoicePreview(id);
 const pending=client.readInvoicePreviewPdf(id,{expectedDigest:digest});await assert.rejects(client.readInvoicePreviewPdf(id,{expectedDigest:digest}),{code:'REQUEST_BUSY'});assert.equal(calls,2);token='account-b';resolve(new Response(bytes,{headers:response.headers}));await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});
});
test('PDF timeout makes no automatic retry and never clears or creates consent',async()=>{
 const s=invoiceSample(),id=s.checkoutId,digest=downloadInvoiceDigest(s),preview={id,kind:'invoice_preview',snapshot:s,digest,invoiceDelivered:false,canPay:false,canActivate:false,checkoutConnected:false};let requests=0;
 const client=createDownloadReviewClient({timeoutMs:10,getToken:()=> 'fixture',fetcher:async(url,options)=>{requests++;if(!url.endsWith('.pdf'))return Response.json(preview);return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('private timeout')),{once:true}));}});await client.readInvoicePreview(id);await assert.rejects(client.readInvoicePreviewPdf(id,{expectedDigest:digest}),{code:'PDF_UNAVAILABLE'});assert.equal(requests,2);
});

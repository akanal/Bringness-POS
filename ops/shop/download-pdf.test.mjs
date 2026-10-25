import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pdfRenderer} from './download-pdf-fixture.mjs';
import {invoiceSample} from './download-invoice-fixture.mjs';
import {downloadFixture,seller} from './download-fixture.mjs';
import {downloadInvoiceDigest} from '../../server/shop-download-invoice.js';
import {renderShopDownloadInvoicePreviewPdf,shopDownloadInvoicePdfResponse} from '../../server/shop-download-invoice-pdf.js';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
import {createDownloadReviewClient} from '../../apps/web/public/shop/download-review-client.js';

test('native PDF is deterministic, bounded and bound to the immutable source model',async()=>{
 const s=invoiceSample();s.buyer.company_name='Şahin & Müller GmbH';const a=await pdfRenderer(s),b=await pdfRenderer(s);assert.deepEqual(a,b);assert.match(a.subarray(0,8).toString(),/^%PDF-1.7/);assert.ok(a.length>100&&a.length<2097152);
 const res=shopDownloadInvoicePdfResponse(s,a);assert.equal(res.headers['X-Shop-Invoice-Source-Digest'],downloadInvoiceDigest(s));assert.equal(res.headers['X-Shop-Pdf-Sha256'],crypto.createHash('sha256').update(a).digest('hex'));assert.match(res.headers['Content-Disposition'],/^attachment; filename="Bringness-Vorschau-BN-2026-001000.pdf"$/);assert.equal(res.headers['Cache-Control'],'private, no-store');
 for(const bytes of [Buffer.from('invalid'),Buffer.alloc(2097153)])assert.throws(()=>shopDownloadInvoicePdfResponse(s,bytes),{code:'PDF_UNAVAILABLE'});
});
test('unsupported glyphs, directional controls and malformed financial data fail before output',async()=>{
 for(const name of ['中文公司','Name\u202eTEST','شركة عربية']){const s=invoiceSample();s.buyer.company_name=name;await assert.rejects(pdfRenderer(s),{code:'PDF_TEXT_UNSUPPORTED'});}
 const s=invoiceSample();await assert.rejects(pdfRenderer({...s,product:{...s.product,grossCents:1}}),{code:'FULFILMENT_MISMATCH'});
 await assert.rejects(renderShopDownloadInvoicePreviewPdf(s,{PDFDocument:class{constructor(){throw Error('private renderer details');}}}),e=>e.code==='PDF_UNAVAILABLE'&&!e.message.includes('private'));
});
test('bundled font bytes match the reviewed coverage manifest',async()=>{
 const root=new URL('../../server/assets/shop-invoice-fonts/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root)));
 for(const [name,entry]of Object.entries(manifest)){assert.equal(crypto.createHash('sha256').update(await readFile(new URL(name,root))).digest('hex'),entry.sha256);for(const cp of ['Ä','ü','€','Ş','ı'])assert.ok(entry.coverage.some(([a,b])=>cp.codePointAt(0)>=a&&cp.codePointAt(0)<=b));}
 assert.match(await readFile(new URL('LICENSE.txt',root),'utf8'),/Permission is hereby granted/);
});
test('owner PDF GET reuses recorded number and amounts without any new financial writes',async()=>{
 const f=await downloadFixture(),runtime=createShopDownloadRuntime(f.pool,{enabled:true,seller,publicOrigin:'https://fixture.example.test',pdfRenderer});await runtime.migrate();const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let token='owner-a';
 try{
  await f.db.exec("UPDATE shop_checkout_orders SET provider_mode='live'");await f.run();const before=(await f.db.query('SELECT * FROM billing_transactions')).rows;
  const client=createDownloadReviewClient({getToken:()=>token,fetcher:(url,options)=>fetch(origin+url,options)}),preview=await client.readInvoicePreview(f.order.id),file=await client.readInvoicePreviewPdf(f.order.id,{expectedDigest:preview.digest});assert.match(file.filename,/^Bringness-Vorschau-BN-2026-\d{6}.pdf$/);assert.ok(file.bytes.length>100);assert.equal(file.sourceDigest,preview.digest);
  const again=await client.readInvoicePreviewPdf(f.order.id,{expectedDigest:preview.digest});assert.deepEqual(file.bytes,again.bytes);assert.deepEqual((await f.db.query('SELECT * FROM billing_transactions')).rows,before);assert.equal((await f.db.query('SELECT 1 FROM company_entitlements')).rows.length,1);
  for(const [who,status]of [['owner-b',404],['waiter',403],['expired',401]]){const res=await fetch(origin+`/api/v1/shop/downloads/${f.order.id}/invoice-preview.pdf`,{headers:{Authorization:'Bearer '+who}});assert.equal(res.status,status);assert.equal(res.headers.get('content-type'),'application/json; charset=utf-8');}
  token='owner-b';await assert.rejects(client.readInvoicePreviewPdf(f.order.id,{expectedDigest:preview.digest}),{code:'ACCOUNT_CHANGED'});
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});
test('binary client rejects mismatched source, file names, lengths, modes and altered bytes',async()=>{
 const s=invoiceSample(),id=s.checkoutId,digest=downloadInvoiceDigest(s),bytes=await pdfRenderer(s),response=shopDownloadInvoicePdfResponse(s,bytes),preview={id,kind:'invoice_preview',snapshot:s,digest,invoiceDelivered:false,canPay:false,canActivate:false,checkoutConnected:false};
 for(const patch of [{'X-Shop-Invoice-Source-Digest':'0'.repeat(64)},{'Content-Type':'text/html'},{'Content-Disposition':'attachment; filename="../../private.pdf"'},{'Content-Length':'2097153'},{'Content-Length':String(bytes.length-1)},{'X-Shop-Pdf-Sha256':'0'.repeat(64)}]){
  const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async url=>url.endsWith('.pdf')?new Response(bytes,{headers:{...response.headers,...patch}}):Response.json(preview)});await client.readInvoicePreview(id);await assert.rejects(client.readInvoicePreviewPdf(id,{expectedDigest:digest}));
 }
 let calls=0;const client=createDownloadReviewClient({getToken:()=> 'fixture',fetcher:async()=>{calls++;return Response.json(preview);}});await assert.rejects(client.readInvoicePreviewPdf(id,{expectedDigest:digest}),{code:'INVOICE_PREVIEW_REQUIRED'});assert.equal(calls,0);
});

import {EventEmitter} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentReceiptHandler} from './payment-receipt-core.js';
const receiptId='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',publicToken='33333333-3333-4333-8333-333333333333';
async function run(fiscalStatus,{authenticated=true,found=true,qrFails=false,urlFails=false,writerFailure=null,PdfWriter=null,QrWriter=null}={}){
 const documents=[],queries=[];
 class Pdf extends EventEmitter {
 constructor(options){super();if(writerFailure==='constructor')throw Error('writer unavailable');this.options=options;this.page={width:226.77,margins:{left:options.margin}};this.y=100;this.texts=[];this.images=[];documents.push(this);}
 fontSize(){return this;}font(){return this;}moveDown(){return this;}fillColor(){return this;}image(buffer,x,y,options){this.images.push({x,y,...options});return this;}
 text(value){if(writerFailure==='draw')throw Error('render failed');this.texts.push(value);return this;}destroy(){this.destroyed=true;return this;}end(){this.ended=true;if(writerFailure==='stream')this.emit('error',Error('stream failed'));else this.emit('data',Buffer.from('%PDF-simulated'));this.emit('end');return this;}
 }
 const pool={query:async(sql,args)=>{
 queries.push({sql,args});
 if(sql.includes('FROM sessions')){assert.match(sql,/coalesce\(u.must_change_password,false\)=false/);return {rows:authenticated?[{id:receiptId,company_id:company,role:'owner'}]:[]};}
 if(sql.includes('FROM receipts rc')){
 assert.match(sql,/rc.id=\$1 AND c.id=\$2/);assert.deepEqual(args,[receiptId,company]);
 return {rowCount:found?1:0,rows:found?[{receipt_number:'BN-2026-000042',issued_at:'2026-10-06T12:00:00Z',public_token:publicToken,fiscal_status:fiscalStatus,order_id:'order',total_cents:1190,restaurant_name:'Current name',company_name:'Company',merchant_snapshot:{restaurantName:'Historisches Restaurant',businessName:'Historischer Betrieb'}}]:[]};
 }
 if(sql.includes('FROM order_items'))return {rows:[{product_name_snapshot:'Gericht',unit_price_cents:1190,tax_rate_snapshot:19,quantity:1}]};
 if(sql.includes('FROM payments'))return {rows:[{method:'mollie_center',amount_cents:1190}]};
 throw Error('Unexpected query');
 }};
 const handler=createPaymentReceiptHandler(pool,PdfWriter||Pdf,QrWriter||{toBuffer:async(url)=>{if(qrFails)throw Error('simulated QR outage');assert.equal(url,'https://pos.example.test/beleg/'+publicToken);return Buffer.from('simulated QR image');}},(_req,token)=>{if(urlFails)throw Error('invalid origin');return 'https://pos.example.test/beleg/'+token;});
 const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(raw){if(Buffer.isBuffer(raw))this.pdf=raw;else this.body=JSON.parse(raw);}};
 assert.equal(await handler({url:'/api/v1/receipts/'+receiptId+'/pdf',method:'GET',headers:{authorization:'Bearer operator'}},res),true);
 return {res,documents,queries};
}
for(const fiscalStatus of ['pending','prepared','needs_review','signed']){
 test('PDF template respects stored fiscal status: '+fiscalStatus,async()=>{
 const {res,documents}=await run(fiscalStatus);assert.equal(res.status,200);assert.equal(res.headers['content-type'],'application/pdf');
 assert.equal(res.pdf.toString(),'%PDF-simulated');
 const doc=documents[0],text=doc.texts.join('\n');
 assert.equal(doc.ended,true);assert.match(text,/Historisches Restaurant/);assert.match(text,/Historischer Betrieb/);
 assert.equal(doc.images.length,1);assert.equal(doc.images[0].x,(doc.page.width-doc.images[0].width)/2);assert.equal(doc.x,doc.page.margins.left);
 assert.match(text,/Gesamt: 11,90 EUR/);assert.match(text,/Steuer: 1,90 EUR/);assert.match(text,/Online-Zahlung/);assert.doesNotMatch(text,/mollie_center/);
 assert.equal(text.includes('Nicht TSE-signiert'),fiscalStatus!=='signed');assert.doesNotMatch(text,/Eine TSE ist nicht angeschlossen/);
 });
}
test('PDF download requires an active session and company-scoped receipt lookup',async()=>{
 const unauth=await run('signed',{authenticated:false});assert.equal(unauth.res.status,401);assert.equal(unauth.documents.length,0);assert.equal(unauth.queries.length,1);
 const missing=await run('signed',{found:false});assert.equal(missing.res.status,404);assert.equal(missing.documents.length,0);assert.equal(missing.queries.length,2);
});

for(const failure of [{qrFails:true},{urlFails:true}]){
 test('QR preparation failure returns JSON before starting PDF output: '+JSON.stringify(failure),async()=>{
 const result=await run('pending',failure);
 assert.equal(result.res.status,503);assert.equal(result.res.headers['content-type'],'application/json');
 assert.match(result.res.body.error,/PDF/);assert.equal(result.documents.length,0);
 });
}

test('malformed receipt UUID cannot reach session or receipt queries',async()=>{
 const handler=createPaymentReceiptHandler({query(){throw Error('must not query');}},class{}, {},()=>{throw Error('must not create link');});
 const res={writeHead(status){this.status=status;},end(raw){this.body=JSON.parse(raw);}};
 assert.equal(await handler({url:'/api/v1/receipts/'+'-'.repeat(36)+'/pdf',method:'GET',headers:{authorization:'Bearer operator'}},res),true);
 assert.equal(res.status,404);
});

for(const writerFailure of ['constructor','draw','stream']){
 test('PDF writer failure returns JSON without a partial download: '+writerFailure,async()=>{
 const {res,documents}=await run('pending',{writerFailure});
 assert.equal(res.status,503);assert.equal(res.headers['content-type'],'application/json');
 assert.equal(res.pdf,undefined);assert.match(res.body.error,/PDF/);
 if(documents.length)assert.equal(documents[0].destroyed,true);
 });
}

test('real PDFKit and QR encoder produce a complete buffered receipt',{skip:!process.env.CENTER_TEST_PDFKIT||!process.env.CENTER_TEST_QRCODE},async()=>{
 const [{default:PdfWriter},{default:QrWriter}]=await Promise.all([import(process.env.CENTER_TEST_PDFKIT),import(process.env.CENTER_TEST_QRCODE)]);
 const {res}=await run('pending',{PdfWriter,QrWriter});
 assert.equal(res.status,200);assert.equal(res.headers['content-type'],'application/pdf');
 assert.ok(res.pdf.length>1000);assert.equal(res.pdf.subarray(0,5).toString(),'%PDF-');
 assert.match(res.pdf.subarray(-100).toString(),/%%EOF/);
});

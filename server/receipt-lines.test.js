import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {receiptLines} from './receipt-lines.js';
import {renderPaymentReceipt} from './payment-receipt-core.js';
import {createPublicReceiptHandler} from './public-receipt-core.js';
const line=(name,unit,qty,rate=0,product=null)=>({product_id:product,product_name_snapshot:name,unit_price_cents:unit,quantity:qty,tax_rate_snapshot:rate});
const items=[line('Pfand: Glas',25,1),line('Coca-Cola',299,1,19,'a'),line('Pfand: Flasche',25,4),line('River cola',399,3,19,'b'),line('Pfand: Dose',8,3),line('Fanta',299,4,19,'c')];
const receipt={restaurant_name:'Bringness Testbetrieb',company_name:'Test',receipt_number:'BN-2026-001097',issued_at:'2026-10-20T13:58:47Z',order_id:'order',total_cents:2841,public_token:'bb9f042a-1529-43b9-8899-a2be1accbd16',fiscal_status:'unsigned'};
const pool={query:async sql=>({rows:sql.includes('FROM order_items')?structuredClone(items):sql.includes('FROM payments')?[{method:'cash',amount_cents:2841}]:[structuredClone(receipt)]})};
test('deposit projection groups equal amounts last without changing source, rounding or credits',()=>{
 const input=[line('Pfand: A',25,1,19),line('Drink',100,1,19,'p'),line('Pfand: B',25,1,19),line('Pfand: C',25,2,7),line('Pfandrücknahme: A',-25,1,19),line('Pfand: ordinary name',300,1,19,'q'),line('Pfand: D',8,3)];
 const before=JSON.stringify(input),rows=receiptLines(input);
 assert.equal(JSON.stringify(input),before);
 assert.deepEqual(rows.map(x=>x.product_name_snapshot),['Drink','Pfand: ordinary name','Pfand','Pfandrücknahme','Pfand']);
 assert.equal(rows[2].quantity,4);assert.equal(rows[2].grossCents,100);assert.equal(rows[2].netCents,89);assert.equal(rows[2].taxCents,11);assert.equal(rows[2].mixedTax,true);
 assert.equal(rows[3].grossCents,-25);assert.equal(rows[4].quantity,3);
});
async function pdfText(formatA4=false){
 const bytes=await renderPaymentReceipt(pool,PDFDocument,QRCode,()=> 'https://example.org/beleg/test',{}, {...receipt,formatA4,recipient:{name:'Testkunde'}});
 const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});const pdf=await loading.promise;
 let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
 await loading.destroy();return text;
}
for(const a4 of [false,true])test((a4?'A4':'thermal')+' PDF puts grouped deposit after merchandise and retains exact totals',async()=>{
 const text=await pdfText(a4);assert.equal((text.match(/Pfand/g)||[]).length,2);assert(text.indexOf('Fanta')<text.indexOf('Pfand'));
 assert.match(text,/5\s+x\s+0,25 EUR\s+1,25 EUR|5\s+0,25 EUR\s+1,25 EUR/);
 assert.match(text,/3\s+x\s+0,08 EUR\s+0,24 EUR|3\s+0,08 EUR\s+0,24 EUR/);
 assert.match(text,/28,41 EUR/);assert.match(text,/4,30 EUR/);assert.doesNotMatch(text,/Positionssumme weicht/);
});
test('QR receipt uses the same grouped rows below products with original VAT totals',async()=>{
 let html,status;const res={writeHead:s=>status=s,end:s=>html=s};
 await createPublicReceiptHandler(pool)({url:'/beleg/'+receipt.public_token,method:'GET'},res);
 assert.equal(status,200);assert.equal((html.match(/<span>Pfand<small>/g)||[]).length,2);assert(html.indexOf('Fanta')<html.indexOf('<span>Pfand<small>'));
 assert.match(html,/5 × 0,25/);assert.match(html,/1,25/);assert.match(html,/0,24/);assert.match(html,/28,41/);assert.match(html,/4,30/);
});

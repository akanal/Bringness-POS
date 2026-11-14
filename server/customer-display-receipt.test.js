import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentReceiptHandler} from './payment-receipt-core.js';
import {createPublicReceiptHandler} from './public-receipt-core.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
const order='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',capability='33333333-3333-4333-8333-333333333333';
function response(){return {writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}}}
const url=(_,token)=>'https://bringness.de/beleg/'+token;
test('customer QR requires an active authorized POS session, paid checkout and matching venue/company',async()=>{
 let actor=null,receipt=null,queries=[];
 const pool={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('FROM sessions')?(actor?[actor]:[]):receipt?[receipt]:[]}}};
 const handler=createPaymentReceiptHandler(pool,PDFDocument,QRCode,url);
 const req={method:'GET',url:'/api/v1/receipts/customer-display?orderId='+order+'&restaurantId='+rid,headers:{authorization:'Bearer synthetic',host:'bringness.de'}};
 let res=response();await handler(req,res);assert.equal(res.status,401);
 actor={role:'waiter',company_id:'company'};res=response();await handler(req,res);assert.equal(res.status,403);
 actor.role='owner';res=response();await handler(req,res);assert.equal(res.status,404);
 const query=queries.at(-1);assert.deepEqual(query.args,[order,rid,'company']);assert.match(query.sql,/o.status='paid'/);assert.match(query.sql,/cr.order_id=o.id/);assert.match(query.sql,/r.company_id=\$3/);
 receipt={receipt_number:'BN-2026-000001',public_token:capability};res=response();await handler(req,res);assert.equal(res.status,200);const result=JSON.parse(res.body);assert.match(result.qrDataUrl,/^data:image\/png;base64,/);assert.equal(result.receiptNumber,receipt.receipt_number);assert.equal(res.headers['cache-control'],'no-store');assert.ok(!res.body.includes('synthetic'));assert.equal(Object.hasOwn(result,'recipient'),false);
 res=response();await handler({...req,url:req.url.replace(order,'invalid')},res);assert.equal(res.status,400);
});
test('receipt QR encodes only the exact public PDF capability',async()=>{
 let encoded;const pool={query:async sql=>({rows:sql.includes('FROM sessions')?[{role:'owner',company_id:'company'}]:[{receipt_number:'BN-1',public_token:capability}]})};
 const h=createPaymentReceiptHandler(pool,null,{toDataURL:async value=>{encoded=value;return 'data:image/png;base64,AA=='}},url),res=response();
 await h({method:'GET',url:'/api/v1/receipts/customer-display?orderId='+order+'&restaurantId='+rid,headers:{authorization:'Bearer synthetic'}},res);
 assert.equal(encoded,'https://bringness.de/beleg/'+capability+'/pdf');
});
test('public PDF reuses stored receipt lines and discount renderer, with no account access',async()=>{
 const pool={query:async(sql,args)=>{if(sql.includes('FROM receipts')){assert.deepEqual(args,[capability]);return {rows:[{receipt_number:'BN-2026-000001',public_token:capability,issued_at:'2026-11-14T12:00:00Z',fiscal_status:'pending',order_id:order,total_cents:100,restaurant_name:'Testbetrieb',company_name:'Testfirma'}]}}if(sql.includes('FROM order_items'))return {rows:[{product_name_snapshot:'Artikel',unit_price_cents:100,tax_rate_snapshot:19,quantity:1}]};if(sql.includes('FROM payments'))return {rows:[{method:'cash',amount_cents:100}]};throw Error(sql)}};
 const h=createPublicReceiptHandler(pool,{PDFDocument,QRCode,receiptUrl:url}),res=response();
 assert.equal(await h({url:'/beleg/'+capability+'/pdf',method:'GET',headers:{host:'bringness.de'}},res),true);
 assert.equal(res.status,200);assert.equal(res.headers['content-type'],'application/pdf');assert.match(res.headers['content-disposition'],/attachment/);assert.equal(res.headers['cache-control'],'private, no-store');assert.equal(res.body.subarray(0,4).toString(),'%PDF');
 assert.equal(await h({url:'/beleg/internal-id/pdf',method:'GET'},response()),false);
});

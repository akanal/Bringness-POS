import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicReceiptHandler} from '../server/public-receipt-core.js';

function mockReceipt(snapshot,status='signed'){
 const queries=[];
 const pool={query:async(sql)=>{
  queries.push(sql);
  if(sql.includes('FROM receipts rc'))return {rows:[{
   receipt_number:'BN-001',issued_at:'2026-10-16T08:00:00Z',
   fiscal_status:status,tse_snapshot:snapshot,order_id:'order-1',total_cents:1190,
   restaurant_name:'Testlokal',company_name:'Testfirma'
  }]};
  return {rows:[]};
 }};
 let body='',code=0;
 const res={writeHead:(status)=>{code=status},end:(html)=>{body=html}};
 return {queries,res,read:()=>({body,code}),handler:createPublicReceiptHandler(pool)};
}
const request={method:'GET',url:'/beleg/11111111-1111-4111-8111-111111111111'};

test('public receipt displays signed TSE fields with escaped signature',async()=>{
 const fixture=mockReceipt({serialNumber:'TSE-123',transactionNumber:'42',signatureCounter:'3',signature:'<script>alert(1)</script>'});
 assert.equal(await fixture.handler(request,fixture.res),true);
 const {body,code}=fixture.read();
 assert.equal(code,200);
 assert.match(body,/TSE-Seriennummer/);
 assert.match(body,/TSE-123/);
 assert.match(body,/TSE-Transaktion/);
 assert.match(body,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(body,/<script>alert\(1\)<\/script>/);
 assert.ok(fixture.queries[0].includes('rc.tse_snapshot'));
});

test('unsigned public receipt never exposes TSE signature',async()=>{
 const fixture=mockReceipt({signature:'secret'},'needs_review');
 await fixture.handler(request,fixture.res);
 const {body}=fixture.read();
 assert.doesNotMatch(body,/secret/);
 assert.match(body,/Nicht TSE-signiert/);
});

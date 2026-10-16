import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicReceiptHandler} from '../server/public-receipt-core.js';

function mockReceipt(snapshot,status='signed',found=true){
 const queries=[];
 const pool={query:async(sql)=>{
  queries.push(sql);
  if(sql.includes('FROM receipts rc'))return {rows:found?[{
   public_token:'11111111-1111-4111-8111-111111111111',receipt_number:'BN-001',issued_at:'2026-10-16T08:00:00Z',
   fiscal_status:status,tse_snapshot:snapshot,order_id:'order-1',total_cents:1190,
   restaurant_name:'Testlokal',company_name:'Testfirma'
  }]:[]};
  return {rows:[]};
 }};
 let body='',code=0,headers={};
 const res={writeHead:(status,h)=>{code=status;headers=h||{}},end:(html)=>{body=html}};
 return {queries,res,read:()=>({body,code,headers}),handler:createPublicReceiptHandler(pool)};
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

test('printed receipt includes a centered QR for its own public token',async()=>{
 const previous=process.env.PUBLIC_RECEIPT_ORIGIN;
 process.env.PUBLIC_RECEIPT_ORIGIN='https://pos.example.test';
 try{
  const fixture=mockReceipt(null);
  await fixture.handler(request,fixture.res);
  const {body}=fixture.read();
  assert.match(body,/class="section receipt-qr"/);
  assert.match(body,/<svg[^>]*>/);
  assert.match(body,/Scannen und Beleg digital öffnen/);
  assert.match(body,/receipt-qr\{text-align:center\}/);
 }finally{
  if(previous===undefined)delete process.env.PUBLIC_RECEIPT_ORIGIN;
  else process.env.PUBLIC_RECEIPT_ORIGIN=previous;
 }
});

test('no public receipt QR is printed for an insecure origin',async()=>{
 const previous=process.env.PUBLIC_RECEIPT_ORIGIN;
 process.env.PUBLIC_RECEIPT_ORIGIN='http://localhost:3000';
 try{
  const fixture=mockReceipt(null);
  await fixture.handler(request,fixture.res);
  assert.doesNotMatch(fixture.read().body,/class="section receipt-qr"/);
 }finally{
  if(previous===undefined)delete process.env.PUBLIC_RECEIPT_ORIGIN;
  else process.env.PUBLIC_RECEIPT_ORIGIN=previous;
 }
});

test('unknown receipt token returns 404 without exposing another receipt',async()=>{
 const pool={query:async()=>({rows:[]})};
 let status,body;
 const res={writeHead:(code)=>{status=code},end:(value)=>{body=value}};
 const handled=await createPublicReceiptHandler(pool)(request,res);
 assert.equal(handled,true);
 assert.equal(status,404);
 assert.equal(body,'Beleg nicht gefunden');
});

test('non-GET request cannot retrieve public receipt',async()=>{
 const pool={query:async()=>{throw Error('must not query')}};
 const handled=await createPublicReceiptHandler(pool)({...request,method:'POST'},{});
 assert.equal(handled,false);
});

test('invalid public receipt token does not generate printable QR',async()=>{
 const old=process.env.PUBLIC_RECEIPT_ORIGIN;
 process.env.PUBLIC_RECEIPT_ORIGIN='https://pos.example.test';
 try{
  const pool={query:async(sql)=>sql.includes('FROM receipts rc')?{rows:[{
   public_token:'../another-receipt',receipt_number:'BN-002',
   issued_at:'2026-10-16T08:00:00Z',fiscal_status:'needs_review',
   order_id:'order-2',total_cents:100,restaurant_name:'Test',company_name:'Test'
  }]}:{rows:[]}};
  let html='';
  await createPublicReceiptHandler(pool)(request,{writeHead(){},end(value){html=value}});
  assert.doesNotMatch(html,/class="section receipt-qr"/);
 }finally{
  if(old===undefined)delete process.env.PUBLIC_RECEIPT_ORIGIN;
  else process.env.PUBLIC_RECEIPT_ORIGIN=old;
 }
});

test('public digital receipt prevents caching and MIME sniffing',async()=>{
 const fixture=mockReceipt(null);
 await fixture.handler(request,fixture.res);
 const {code,headers}=fixture.read();
 assert.equal(code,200);
 assert.match(headers['cache-control'],/no-store/);
 assert.match(headers['cache-control'],/max-age=0/);
 assert.equal(headers.pragma,'no-cache');
 assert.equal(headers['x-content-type-options'],'nosniff');
 assert.match(headers['content-security-policy'],/default-src 'none'/);
});

test('unknown digital receipt is private and never cached',async()=>{
 const fixture=mockReceipt(null,'signed',false);
 await fixture.handler(request,fixture.res);
 const {code,headers,body}=fixture.read();
 assert.equal(code,404);
 assert.match(body,/Beleg nicht gefunden/);
 assert.equal(headers['cache-control'],'no-store');
 assert.equal(headers['x-content-type-options'],'nosniff');
 assert.match(headers['x-robots-tag'],/noindex/);
 assert.equal(headers['referrer-policy'],'no-referrer');
});

test('malformed public receipt URLs never reach the database',async()=>{
 const pool={query:async()=>{throw Error('invalid link must not query database')}};
 const handler=createPublicReceiptHandler(pool);
 const malformed=[
  '/beleg/not-a-uuid',
  '/beleg/11111111-1111-4111-8111-11111111111Z',
  '/beleg/11111111-1111-4111-8111-111111111111/extra',
  '/beleg/%2e%2e%2fadmin',
  '/beleg/11111111-1111-4111-8111-111111111111%0a'
 ];
 for(const url of malformed){
  assert.equal(await handler({method:'GET',url},{writeHead(){throw Error('unexpected response')},end(){throw Error('unexpected body')}}),false,url);
 }
});

test('uppercase UUID in a valid QR link resolves to canonical receipt token',async()=>{
 const queries=[];
 const pool={query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM receipts rc'))return {rows:[]};
  throw Error('unexpected query');
 }};
 let status=0;
 const handler=createPublicReceiptHandler(pool);
 const handled=await handler({method:'GET',url:'/beleg/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'},{writeHead(code){status=code},end(){}});
 assert.equal(handled,true);
 assert.equal(status,404);
 assert.equal(queries.length,1);
 assert.equal(queries[0].args[0],'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});

test('valid receipt URL with query parameters still resolves only its UUID',async()=>{
 const queries=[];
 const pool={query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM receipts rc'))return {rows:[]};
  throw Error('unexpected query');
 }};
 let status=0;
 const handled=await createPublicReceiptHandler(pool)(
  {method:'GET',url:'/beleg/11111111-1111-4111-8111-111111111111?utm_source=qr&extra=ignored'},
  {writeHead(code){status=code},end(){}}
 );
 assert.equal(handled,true);
 assert.equal(status,404);
 assert.equal(queries.length,1);
 assert.deepEqual(queries[0].args,['11111111-1111-4111-8111-111111111111']);
});

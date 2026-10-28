import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBillingInvoiceRoute} from '../../server/billing-invoice-route.js';
const path='/api/v1/billing/invoices/BN-TEST-1/pdf';
function response(){return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
test('billing download authenticates, scopes lookup, and serves original archive bytes',async()=>{
 const invoice={id:'transaction',company_id:'account-a',invoice_number:'BN-TEST-1'},bytes=Buffer.from('%PDF-1.7\noriginal');let lookups=0,reads=0;
 const pool={async query(sql,args){lookups++;assert.match(sql,/bt.company_id=\$1/);assert.match(sql,/bt.status='paid'/);assert.deepEqual(args,['account-a','BN-TEST-1']);return {rowCount:1,rows:[invoice]};}};
 const route=createBillingInvoiceRoute(pool,async()=>({company_id:'account-a'}),{env:{SHOP_DOCUMENT_STORAGE:'idrive'},download:async z=>{reads++;assert.equal(z,invoice);return bytes;}});
 const res=response();assert.equal(await route({method:'GET'},res,path),true);assert.equal(res.status,200);assert.deepEqual(res.body,bytes);assert.equal(res.headers['cache-control'],'private, no-store');assert.equal(lookups,1);assert.equal(reads,1);
 assert.equal(await route({method:'POST'},response(),path),false);assert.equal(lookups,1);
 const denied=createBillingInvoiceRoute(pool,async(req,res)=>{res.writeHead(401,{});res.end();return null;},{env:{SHOP_DOCUMENT_STORAGE:'idrive'}});
 const deniedResponse=response();assert.equal(await denied({method:'GET'},deniedResponse,path),true);assert.equal(deniedResponse.status,401);assert.equal(lookups,1);
});
test('another account gets no invoice and provider failure never sends a successful PDF response',async()=>{
 let reads=0;
 const missing=createBillingInvoiceRoute({query:async(sql,args)=>{assert.deepEqual(args,['account-b','BN-TEST-1']);return {rowCount:0,rows:[]};}},async()=>({company_id:'account-b'}),{env:{SHOP_DOCUMENT_STORAGE:'idrive'},download:async()=>{reads++;}});
 const notFound=response();assert.equal(await missing({method:'GET'},notFound,path),true);assert.equal(notFound.status,404);assert.equal(reads,0);
 const failure=createBillingInvoiceRoute({query:async()=>({rowCount:1,rows:[{invoice_number:'BN-TEST-1'}]})},async()=>({company_id:'account-a'}),{env:{SHOP_DOCUMENT_STORAGE:'idrive'},download:async()=>{throw Error('private provider failure');}});
 const unavailable=response();assert.equal(await failure({method:'GET'},unavailable,path),true);assert.equal(unavailable.status,503);assert.doesNotMatch(unavailable.body,/private provider failure|%PDF/);
});

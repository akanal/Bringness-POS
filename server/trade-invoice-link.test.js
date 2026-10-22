import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicTradeInvoiceHandler,tradeInvoiceUrl} from './payment-receipt-core.js';
const token='b74616e6-6373-4d10-adb4-5ef29e56ef81';
const response=()=>({writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}});

test('invoice URL requires a separate well-formed capability and retains configured origin',()=>{
 assert.equal(tradeInvoiceUrl({},token,()=> 'https://pos.example.test/beleg/'+token),'https://pos.example.test/rechnung/'+token);
 for(const bad of ['',undefined,'-'.repeat(36),'not-a-token'])assert.throws(()=>tradeInvoiceUrl({},bad,()=>{throw Error('must not create a URL');}));
 for(const base of ['javascript:alert(1)','https://user:secret@example.test/beleg/'+token])assert.throws(()=>tradeInvoiceUrl({},token,()=>base));
});

test('invalid or unsupported invoice requests never query or start a PDF',async()=>{
 const handler=createPublicTradeInvoiceHandler({query(){throw Error('must not query');}},class{}, {},()=>{throw Error('must not create a URL');});
 for(const [path,method,status] of [['/rechnung/not-a-token','GET',404],['/rechnung/'+token+'/other','GET',404],['/rechnung/'+token,'POST',405]]){
  const res=response();assert.equal(await handler({url:path,method},res),true);assert.equal(res.status,status);assert.match(res.headers['cache-control'],/no-store/);assert.equal(res.headers['referrer-policy'],'no-referrer');
 }
 assert.equal(await handler({url:'/beleg/'+token,method:'GET'},response()),false);
});

test('public invoice lookup accepts only its invoice capability and returns no customer data for a miss',async()=>{
 const queries=[];const handler=createPublicTradeInvoiceHandler({query:async(sql,args)=>{queries.push(sql);assert.match(sql,/JOIN pos_trade_sales/);assert.match(sql,/WHERE rc\.invoice_public_token=\$1/);assert.deepEqual(args,[token]);return {rows:[]};}},class{}, {},()=>{throw Error('must not create a URL');});
 const res=response();await handler({url:'/rechnung/'+token,method:'GET'},res);assert.equal(res.status,404);assert.equal(res.body,'Rechnung nicht gefunden');assert.equal(queries.length,1);
});

test('public QR failure remains read-only and returns a safe error before PDF output',async()=>{
 const queries=[];const pool={query:async(sql)=>{queries.push(sql);if(sql.includes('FROM order_items'))return {rows:[]};if(sql.includes('FROM payments'))return {rows:[]};return {rows:[{invoice_public_token:token,public_token:'a6776499-ec74-44da-8324-35e0a3c46a61',receipt_number:'HR-2026-1',order_id:'order',recipient:{name:'Private customer'}}]};}};
 const handler=createPublicTradeInvoiceHandler(pool,class{constructor(){throw Error('must not construct a PDF');}},{toBuffer(){throw Error('simulated QR outage');}},()=> 'https://pos.example.test/beleg/'+token);
 const res=response();await handler({url:'/rechnung/'+token,method:'GET'},res);assert.equal(res.status,503);assert(!res.body.includes(token));assert(!res.body.includes('Private customer'));assert(queries.every(sql=>/^SELECT\b/.test(sql.trim())));assert.match(res.headers['content-type'],/text\/plain/);
});

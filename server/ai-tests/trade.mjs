import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {createPaymentCheckout,migratePaymentCheckout} from '../payment-checkout.js';
const uuid=()=>crypto.randomUUID(),postgresUrl=process.env.CHECKOUT_TEST_DATABASE_URL;
let db,adminDb,schema;
if(postgresUrl){
 const url=new URL(postgresUrl);assert(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
 schema='checkout_'+crypto.randomBytes(8).toString('hex');adminDb=new pg.Pool({connectionString:postgresUrl});await adminDb.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString:postgresUrl,options:'-c search_path='+schema});db.exec=sql=>db.query(sql);db.close=()=>db.end();
}else{db=new PGlite();await db.waitReady;}
const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};};
let failRecord=false,revokeAfterRead=false;
const pool={query:async(sql,args)=>{const result=await query(sql,args);if(revokeAfterRead&&sql.includes('FROM sessions')&&!sql.includes('FOR SHARE')){revokeAfterRead=false;await query("UPDATE users SET role='waiter' WHERE id=$1",[owner]);}return result;},connect:async()=>{
 const client=postgresUrl?await db.connect():{query,release(){}};
 return {query:async(sql,args)=>{if(failRecord&&sql.startsWith('INSERT INTO pos_checkout_requests'))throw Error('simulated request ledger failure');return client.query(sql,args);},release:()=>client.release()};
}};
await db.exec((await fs.readFile(new URL('../../db/schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
await db.exec(`ALTER TABLE users ADD COLUMN role text DEFAULT 'owner';ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
 CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);CREATE SEQUENCE receipt_number_seq;
 ALTER TABLE receipts ADD COLUMN merchant_snapshot jsonb;
 CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);`);
await migratePaymentCheckout(pool);await migratePaymentCheckout(pool);
const company=uuid(),restaurant=uuid(),owner=uuid(),product=uuid(),token='synthetic-checkout-session';
await query("INSERT INTO companies(id,name) VALUES($1,'Fixture')",[company]);
await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Register')",[restaurant,company]);
await query("INSERT INTO users(id,company_id,email,password_hash,display_name) VALUES($1,$2,'owner@example.test','fixture','Owner')",[owner,company]);
await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[crypto.createHash('sha256').update(token).digest('hex'),owner]);
await query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,'Coffee',895,19)",[product,restaurant]);

await query('ALTER TABLE receipts ADD COLUMN public_token uuid DEFAULT gen_random_uuid(); CREATE TABLE personnel_unlocks(token_hash text,session_hash text,user_id uuid,expires_at timestamptz);');
const {createPaymentReceiptHandler}=await import('../payment-receipt-core.js');
const PDFDocument=(await import('pdfkit')).default,QRCode=(await import('qrcode')).default;
const handler=createPaymentCheckout(pool),pdf=createPaymentReceiptHandler(pool,PDFDocument,QRCode,(_req,t)=>'https://example.test/beleg/'+t);
const server=http.createServer(async(req,res)=>{try{if(await handler(req,res))return;if(await pdf(req,res))return;res.writeHead(404);res.end();}catch(e){console.error(e);res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'test failure'}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const send=async(path,method='GET',body,auth=token,unlock='')=>{const r=await fetch(base+'/api/v1'+path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json','x-personnel-unlock':unlock},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:r.headers.get('content-type')?.includes('pdf')?Buffer.from(await r.arrayBuffer()):await r.json()}};
const recipient={name:'Wholesale Customer',street:'Example 1',postalCode:'10115',city:'Berlin',country:'Deutschland',vatId:'DE123'};
const request={requestKey:uuid(),restaurantId:restaurant,salesMode:'trade',recipient,items:[{productId:product,qty:1500}],payments:[{method:'cash',amountCents:300000}]};
const prices={productId:product,tiers:[{minQty:1,priceCents:250},{minQty:1000,priceCents:200}]};
try{
 assert.equal((await send('/trade/prices','PUT',prices)).status,403);
 const unlock='synthetic-unlock',digest=s=>crypto.createHash('sha256').update(s).digest('hex');
 await query("INSERT INTO personnel_unlocks VALUES($1,$2,$3,now()+interval '1 hour')",[digest(unlock),digest(token),owner]);
 assert.equal((await send('/trade/prices','PUT',prices,token,unlock)).status,200);
 assert.equal((await send('/trade/prices?restaurantId='+restaurant)).body.tiers.length,2);
 for(const bad of [[{minQty:0,priceCents:100}],[{minQty:1,priceCents:0}],[{minQty:1,priceCents:100},{minQty:1,priceCents:50}]])assert.equal((await send('/trade/prices','PUT',{...prices,tiers:bad},token,unlock)).status,400);
 assert.equal((await send('/orders/checkout','POST',request)).status,400); // seller missing
 await query("INSERT INTO company_billing_profiles VALUES($1,'Seller GmbH','Street 2','10115','Berlin','DE456')",[company]);
 assert.equal((await send('/orders/checkout','POST',{...request,payments:[{method:'cash',amountCents:1}]})).status,400);
 assert.equal((await send('/orders/checkout','POST',{...request,recipient:{name:'Incomplete'}})).status,400);
 assert.equal((await send('/orders/checkout','POST',{...request,salesMode:'retail'})).status,400); // retail remains limited to 999
 assert.equal((await send('/orders/checkout','POST',{...request,payments:[{method:'card',amountCents:300000}]})).status,409);
 assert.equal(Number((await query('SELECT count(*) n FROM orders')).rows[0].n),0);
 const sale=await send('/orders/checkout','POST',request);assert.equal(sale.status,201);assert.equal(sale.body.totalCents,300000);assert(sale.body.receiptId);
 assert.equal((await query('SELECT unit_price_cents FROM order_items WHERE order_id=$1',[sale.body.id])).rows[0].unit_price_cents,200);
 const invoice=await send('/receipts/'+sale.body.receiptId+'/invoice');if(process.env.TRADE_PDF_PREVIEW)await fs.writeFile(process.env.TRADE_PDF_PREVIEW,invoice.body);assert.equal(invoice.status,200);assert(invoice.body.subarray(0,4).toString()==='%PDF');assert.match(invoice.body.toString('latin1'),/MediaBox \[0 0 595\.28 841\.89\]/);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(invoice.body),useSystemFonts:true}),doc=await loading.promise;
 let content='';for(let i=1;i<=doc.numPages;i++)content+=(await (await doc.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ');
 assert.match(content,/Wholesale Customer/);assert.match(content,/Rechnung/);assert.match(content,/3.000,00/);assert.match(content,/Nicht TSE-signiert/);await loading.destroy();
 assert.equal((await send('/trade/invoices?restaurantId='+restaurant)).body.invoices.length,1);
 await query('UPDATE products SET price_cents=9999 WHERE id=$1',[product]);
 await send('/trade/prices','PUT',{...prices,tiers:[{minQty:1,priceCents:500}]},token,unlock);
 await query("UPDATE company_billing_profiles SET company_name='Changed' WHERE company_id=$1",[company]);
 const replay=await send('/orders/checkout','POST',request);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.totalCents,300000);
 assert.equal((await send('/orders/checkout','POST',{...request,recipient:{...recipient,name:'Different'}})).status,409);
 const original=(await query('SELECT recipient FROM pos_trade_sales WHERE order_id=$1',[sale.body.id])).rows[0].recipient;assert.equal(original.name,recipient.name);
 assert.equal(Number((await query('SELECT count(*) n FROM orders')).rows[0].n),1);
 if(postgresUrl){const concurrent={...request,requestKey:uuid(),payments:[{method:'cash',amountCents:750000}]};const replies=await Promise.all(Array.from({length:5},()=>send('/orders/checkout','POST',concurrent)));assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.status===200).length,4);assert.equal(new Set(replies.map(r=>r.body.id)).size,1);}
 const other=uuid();await query("INSERT INTO companies(id,name) VALUES($1,'Other')",[other]);await query('UPDATE users SET company_id=$1 WHERE id=$2',[other,owner]);
 assert.equal((await send('/receipts/'+sale.body.receiptId+'/invoice')).status,404);assert.equal((await send('/trade/invoices?restaurantId='+restaurant)).body.invoices.length,0);assert.equal((await send('/trade/prices','PUT',prices,token,unlock)).status,404);
 await query('UPDATE users SET company_id=$1,role=$3 WHERE id=$2',[company,owner,'waiter']);assert.equal((await send('/trade/prices?restaurantId='+restaurant)).status,403);
 console.log('Trade integration passed: PIN/tenant isolation, tier validation, large quantities, server price and payment checks, immutable recipient/price/replay, A4 dimensions/text/QR path and archived invoice.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();if(adminDb){await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}}

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


const {migrateTseIntegration}=await import('../tse-integration.js');await migrateTseIntegration(pool);
await query('ALTER TABLE receipts ADD COLUMN public_token uuid DEFAULT gen_random_uuid()');
const {createPublicReceiptHandler}=await import('../public-receipt-core.js');const publicReceipt=createPublicReceiptHandler(pool);
const {createPaymentReceiptHandler}=await import('../payment-receipt-core.js');const PDFDocument=(await import('pdfkit')).default,QRCode=(await import('qrcode')).default;
const pdfReceipt=createPaymentReceiptHandler(pool,PDFDocument,QRCode,(_req,t)=>'https://example.test/beleg/'+t);
const handler=createPaymentCheckout(pool);const server=http.createServer(async(req,res)=>{try{if(await handler(req,res))return;if(await publicReceipt(req,res))return;if(await pdfReceipt(req,res))return;res.writeHead(404);res.end()}catch{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'fixture failure'}))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const send=async(path,method='GET',body,auth=token)=>{const r=await fetch(base+'/api/v1'+path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
const second=uuid(),park=uuid();await query("INSERT INTO products(id,restaurant_id,name,price_cents,tax_rate) VALUES($1,$2,'Reduced tax',100,7)",[second,restaurant]);
const draft={id:park,restaurantId:restaurant,label:'Test bon',items:[{productId:product,qty:3},{productId:second,qty:2}],salesMode:'retail',discount:{kind:'percent',value:1250}};
const sale={requestKey:uuid(),restaurantId:restaurant,items:draft.items,discount:draft.discount,parkedBonId:park,parkedBonVersion:1,payments:[{method:'cash',amountCents:2524}]};
const count=async()=>Number((await query('SELECT count(*) n FROM orders')).rows[0].n);
try{
 assert.equal((await send('/parked-bons','POST',draft)).status,201);assert.equal((await send('/parked-bons','POST',draft)).status,200);assert.equal(await count(),0);assert.equal(Number((await query('SELECT count(*) n FROM payments')).rows[0].n),0);assert.equal(Number((await query('SELECT count(*) n FROM receipts')).rows[0].n),0);
 assert.equal((await send('/parked-bons?restaurantId='+restaurant)).body.bons.length,1);assert.equal((await send('/parked-bons/'+park)).body.payload.discount.value,1250);
 const updated={...draft,version:1,label:'Updated'};delete updated.id;assert.equal((await send('/parked-bons/'+park,'PUT',updated)).body.version,2);assert.equal((await send('/parked-bons/'+park,'PUT',updated)).body.version,2);assert.equal((await send('/parked-bons/'+park,'PUT',{...updated,label:'Stale edit'})).status,409);
 assert.equal((await send('/orders/checkout','POST',sale)).status,409);sale.parkedBonVersion=2;
 for(const discount of [{kind:'amount',value:2885},{kind:'percent',value:10000},{kind:'amount',value:-1}])assert.equal((await send('/orders/checkout','POST',{...sale,discount})).status,400);
 assert.equal((await send('/orders/checkout','POST',{...sale,payments:[{method:'cash',amountCents:2885}]})).status,400);assert.equal(await count(),0);
 failRecord=true;assert.equal((await send('/orders/checkout','POST',sale)).status,503);failRecord=false;assert.equal((await send('/parked-bons/'+park)).body.state,'parked');assert.equal(await count(),0);
 const created=await send('/orders/checkout','POST',sale);assert.equal(created.status,201);assert.equal(created.body.totalCents,2524);assert.equal((await send('/orders/checkout','POST',sale)).status,200);assert.equal((await send('/parked-bons/'+park)).body.state,'paid');assert.equal((await send('/parked-bons?restaurantId='+restaurant)).body.bons.length,0);
 assert.equal((await send('/orders/checkout','POST',{...sale,requestKey:uuid()})).status,409);assert.equal((await send('/orders/checkout','POST',{...sale,discount:{kind:'amount',value:361}})).status,409);assert.equal(await count(),1);
 const fiscal=(await query('SELECT process_data FROM tse_transactions WHERE order_id=$1',[created.body.id])).rows[0].process_data;assert.equal(fiscal.vat.reduce((s,t)=>s+t.grossCents,0),2524);assert.equal(fiscal.items.reduce((s,i)=>s+i.lineTotalCents,0),2524);assert.equal(fiscal.items.reduce((s,i)=>s+i.discountCents,0),361);
 const reference=(await query('SELECT id,public_token FROM receipts WHERE order_id=$1',[created.body.id])).rows[0];const html=await (await fetch(base+'/beleg/'+reference.public_token)).text();assert.match(html,/Rabatt/);assert.match(html,/25,24/);assert.match(html,/3,75/);assert.match(html,/0,11/);
 const pdfResponse=await fetch(base+'/api/v1/receipts/'+reference.id+'/pdf',{headers:{authorization:'Bearer '+token}});assert.equal(pdfResponse.status,200);const bytes=new Uint8Array(await pdfResponse.arrayBuffer());const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:bytes,useSystemFonts:true}),doc=await loading.promise;let text='';for(let i=1;i<=doc.numPages;i++)text+=(await (await doc.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ');assert.match(text,/Rabatt/);assert.match(text,/25,24/);assert.match(text,/3,61/);await loading.destroy();
 const receipt=(await query('SELECT sale_adjustment FROM receipts WHERE order_id=$1',[created.body.id])).rows[0];assert.equal(receipt.sale_adjustment.subtotalCents,2885);assert.equal(receipt.sale_adjustment.discountCents,361);assert.equal(receipt.sale_adjustment.allocations.reduce((s,i)=>s+i.discountCents,0),361);
 if(postgresUrl){const id=uuid();assert.equal((await send('/parked-bons','POST',{...draft,id})).status,201);const requests=Array.from({length:5},()=>({...sale,requestKey:uuid(),parkedBonId:id,parkedBonVersion:1}));const replies=await Promise.all(requests.map(r=>send('/orders/checkout','POST',r)));assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.status===409).length,4);assert.equal(await count(),2);}
 const other=uuid();await query("INSERT INTO companies(id,name) VALUES($1,'Other')",[other]);await query('UPDATE users SET company_id=$1 WHERE id=$2',[other,owner]);assert.equal((await send('/parked-bons/'+park)).status,404);assert.equal((await send('/parked-bons?restaurantId='+restaurant)).body.bons.length,0);
 console.log('Discount/parking passed: mixed-tax cent allocation, no financial booking on park, durable/idempotent save/update, optimistic versions, stale/repeated payment rejection, full transaction rollback and tenant isolation'+(postgresUrl?', five concurrent distinct checkout keys pay one parked bon':'')+'.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();if(adminDb){await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}}

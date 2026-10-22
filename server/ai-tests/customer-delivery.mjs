import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrateCustomerDelivery,createCustomerDelivery} from '../customer-delivery.js';
const postgresUrl=process.env.CHECKOUT_TEST_DATABASE_URL;let db,adminDb,schema;
if(postgresUrl){const u=new URL(postgresUrl);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/bringness_device_test');schema='customers_'+crypto.randomBytes(8).toString('hex');adminDb=new pg.Pool({connectionString:postgresUrl});await adminDb.query('CREATE SCHEMA '+schema);db=new pg.Pool({connectionString:postgresUrl,options:'-c search_path='+schema});db.exec=s=>db.query(s);db.close=()=>db.end();}else{db=new PGlite();await db.waitReady;}
const uuid=()=>crypto.randomUUID(),company=uuid(),restaurant=uuid(),foreign=uuid(),owner=uuid(),product=uuid();
await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,name text,active boolean DEFAULT true);CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);`);
const query=async(s,a)=>{if(a===undefined&&s.includes(';')){await db.exec(s);return {rows:[]};}return db.query(s,a);};
const pool={query,connect:async()=>({query,release(){}})};
await migrateCustomerDelivery(pool);await migrateCustomerDelivery(pool);
await query('INSERT INTO companies VALUES($1)',[company]);await query("INSERT INTO restaurants VALUES($1,$2,'Shop'),($3,$4,'Foreign')",[restaurant,company,foreign,uuid()]);await query('INSERT INTO users VALUES($1)',[owner]);await query("INSERT INTO products(id,restaurant_id,name) VALUES($1,$2,'Original <b>article</b>')",[product,restaurant]);await query("INSERT INTO company_billing_profiles VALUES($1,'Seller GmbH','Street 1','10115','Berlin','DE123')",[company]);
let revoked=false,role='owner',failInsert=false;
const guardedPool={...pool,connect:async()=>{const c=postgresUrl?await db.connect():{query,release(){}};return {query:async(s,a)=>{if(failInsert&&s.startsWith('INSERT INTO pos_delivery_notes'))throw Error('fixture failure');return c.query(s,a);},release:()=>c.release()};}};
const handler=createCustomerDelivery(guardedPool,async(req,_,lock)=>req.headers.authorization==='Bearer good'&&!(lock&&revoked)?{id:owner,company_id:company,role}:null);
const server=http.createServer(async(req,res)=>{try{if(await handler(req,res))return;res.writeHead(404);res.end();}catch{res.writeHead(503,{'content-type':'application/json'});res.end('{}');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const send=async(path,method='GET',body,token='good')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
const recipient={name:'Buyer',street:'Example 1',postalCode:'10115',city:'Berlin',country:'Deutschland',email:'buyer@example.test',phone:'0301234567',taxNumber:'98/765'};
try{
 assert.equal((await send('/customers?restaurantId='+restaurant,'GET',null,'bad')).status,401);
 role='waiter';assert.equal((await send('/customers?restaurantId='+restaurant)).status,403);role='owner';
 assert.equal((await send('/customers?restaurantId='+foreign)).status,404);
 const customer=(await send('/customers','POST',{restaurantId:restaurant,customer:recipient})).body;assert(customer.id);assert.equal(customer.version,1);assert.equal(customer.data.email,recipient.email);assert.equal(customer.data.phone,recipient.phone);
 const edited=await send('/customers','PUT',{restaurantId:restaurant,id:customer.id,version:1,customer:{...recipient,name:'Edited'}});assert.equal(edited.body.version,2);
 assert.equal((await send('/customers','PUT',{restaurantId:restaurant,id:customer.id,version:1,customer:recipient})).status,409);
 assert.equal((await send('/customers?restaurantId='+restaurant+'&q=Edited')).body.customers.length,1);
 assert.equal((await send('/customers?restaurantId='+restaurant+'&q=%25')).body.customers.length,0);
 for(const q of ['buyer@example.test','0301234567','10115','Example 1','98/765'])assert.equal((await send('/customers?restaurantId='+restaurant+'&q='+encodeURIComponent(q))).body.customers.length,1,q);
 const draft={restaurantId:restaurant,requestKey:uuid(),recipient,items:[{productId:product,qty:2500}],note:'Leave at reception'};
 const created=await send('/delivery-notes','POST',draft);assert.equal(created.status,200);const note=created.body.deliveryNote;assert.equal(note.items[0].qty,2500);assert.equal(note.items[0].name,'Original <b>article</b>');assert.equal(note.sender.company_name,'Seller GmbH');
 await query("UPDATE products SET name='Changed',active=false WHERE id=$1",[product]);await query("UPDATE company_billing_profiles SET company_name='Changed' WHERE company_id=$1",[company]);
 const replay=await send('/delivery-notes','POST',draft);assert.equal(replay.body.deliveryNote.id,note.id);assert.equal(replay.body.deliveryNote.items[0].name,'Original <b>article</b>');assert.equal(replay.body.deliveryNote.sender.company_name,'Seller GmbH');
 assert.equal((await send('/delivery-notes','POST',{...draft,note:'changed'})).status,409);
 assert.equal((await send('/delivery-notes','POST',{...draft,requestKey:uuid()})).status,400);
 const archive=await send('/delivery-notes?restaurantId='+restaurant+'&id='+note.id);assert.equal(archive.body.deliveryNotes.length,1);assert.equal(archive.body.deliveryNotes[0].recipient.name,'Buyer');
 assert.equal((await send('/delivery-notes?restaurantId='+foreign+'&id='+note.id)).status,404);
 await query('UPDATE products SET active=true WHERE id=$1',[product]);failInsert=true;assert.equal((await send('/delivery-notes','POST',{...draft,requestKey:uuid()})).status,503);failInsert=false;
 assert.equal(Number((await query('SELECT count(*) n FROM pos_delivery_notes')).rows[0].n),1);
 if(postgresUrl){const concurrent={...draft,requestKey:uuid()};const results=await Promise.all(Array.from({length:5},()=>send('/delivery-notes','POST',concurrent)));assert(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.body.deliveryNote.id)).size,1);assert.equal(Number((await query('SELECT count(*) n FROM pos_delivery_notes')).rows[0].n),2);}
 revoked=true;assert.equal((await send('/customers','POST',{restaurantId:restaurant,customer:recipient})).status,403);revoked=false;
 assert.equal((await send('/delivery-notes','PUT',draft)).status,405);
 console.log('Customer/delivery database integration passed: tenant/role/revocation guards, optimistic customer updates, literal search, immutable sender/recipient/product snapshots, idempotent replay after catalog edits, conflict detection, rollback and scoped archive. No sales/payment/receipt tables exist in this fixture.');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();if(adminDb){await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}} 

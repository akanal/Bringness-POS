import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import pg from 'pg';
import {migrateAccountantAccess,accountantHandler} from '../accountant-access.js';
const connectionString=process.env.ACCOUNTANT_TEST_DATABASE_URL;if(!connectionString)throw Error('Dedicated PostgreSQL export test database required');
const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
const schema='accountant_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
const db=new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=10000'}),id=()=>crypto.randomUUID();
try{
 await db.query((await readFile(new URL('../../db/schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 await db.query("ALTER TABLE users ADD COLUMN role text DEFAULT 'owner';ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);ALTER TABLE receipts ADD COLUMN merchant_snapshot jsonb;");
 await migrateAccountantAccess(db);
 const company=id(),restaurant=id(),owner=id(),token=crypto.randomBytes(32).toString('hex');
 await db.query("INSERT INTO companies(id,name) VALUES($1,'Synthetic export fixture')",[company]);await db.query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Fixture')",[restaurant,company]);
 await db.query("INSERT INTO users(id,company_id,email,password_hash,display_name) VALUES($1,$2,'fixture@example.test','fixture','Owner')",[owner,company]);await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[crypto.createHash('sha256').update(token).digest('hex'),owner]);
 await db.query("INSERT INTO orders(id,restaurant_id,status,total_cents) SELECT overlay(overlay(md5('order-'||i) placing '4' from 13) placing '8' from 17)::uuid,$1,'paid',100 FROM generate_series(1,301) i",[restaurant]);
 await db.query("INSERT INTO receipts(id,order_id,receipt_number,issued_at,merchant_snapshot) SELECT overlay(overlay(md5('receipt-'||i) placing '4' from 13) placing '8' from 17)::uuid,overlay(overlay(md5('order-'||i) placing '4' from 13) placing '8' from 17)::uuid,'MICRO-'||i,'2026-01-15T10:11:12.123456Z'::timestamptz+(i%3)*interval '1 microsecond','{}' FROM generate_series(1,301) i");
 await db.query("INSERT INTO order_items(order_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) SELECT id,'Fixture item',100,19,1 FROM orders");
 await db.query("INSERT INTO payments(order_id,method,amount_cents) SELECT id,'cash',100 FROM orders");
 const handler=accountantHandler(db);
 const call=async(path,{method='GET',body,auth=token}={})=>{const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url:'/api/v1/accountant/'+path,method,headers:{authorization:'Bearer '+auth}});let status,data;await handler(req,{writeHead(code){status=code;},end(raw){data=JSON.parse(raw);}});return {status,data};};
 const granted=await call('grants',{method:'POST',body:{restaurantId:restaurant,from:'2026-01-15',to:'2026-01-15',days:1,label:'Synthetic export'}});assert.equal(granted.status,201);
 const auth=granted.data.token,first=await call('receipts',{auth});assert.equal(first.status,200);assert.equal(first.data.receipts.length,100);assert.match(first.data.asOf,/\.\d{6}Z$/);assert.match(JSON.parse(Buffer.from(first.data.nextCursor,'base64url')).date,/\.\d{6}Z$/);
 await db.query("INSERT INTO orders(id,restaurant_id,status,total_cents) VALUES($1,$2,'paid',100)",[id(),restaurant]);
 await db.query("INSERT INTO receipts(order_id,receipt_number,issued_at,merchant_snapshot) SELECT id,'LATE','2026-01-15T10:11:12.123457Z','{}' FROM orders WHERE NOT EXISTS(SELECT 1 FROM receipts r WHERE r.order_id=orders.id) LIMIT 1");
 let cursor=first.data.nextCursor,all=[...first.data.receipts],pages=1;
 while(cursor){const page=await call('receipts?cursor='+encodeURIComponent(cursor),{auth});assert.equal(page.status,200,JSON.stringify(page.data));assert.equal(page.data.asOf,first.data.asOf);all.push(...page.data.receipts);cursor=page.data.nextCursor;assert(++pages<=5);}
 assert.equal(all.length,301);assert.equal(new Set(all.map(r=>r.id)).size,301);assert.equal(all.some(r=>r.receipt_number==='LATE'),false);assert(all.every(r=>/\.\d{6}Z$/.test(r.issued_at)));
 const expected=(await db.query("SELECT id FROM receipts WHERE receipt_number<>'LATE' ORDER BY issued_at,id")).rows.map(r=>r.id);assert.deepEqual(all.map(r=>r.id),expected);
 await call('revoke',{method:'POST',body:{id:granted.data.id}});assert.equal((await call('receipts?cursor='+encodeURIComponent(first.data.nextCursor),{auth})).status,401);
 console.log('PostgreSQL 16 accountant export passed: 301 microsecond-precision receipts, stable ordering, no repeated/skipped rows, late-record exclusion and revocation.');
}finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}

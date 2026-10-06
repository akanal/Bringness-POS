import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {releaseCenterPayment,centerKitchenQueue,advanceCenterKitchen} from './center-payment-release.js';
import {createCenterHandler} from './center-core.js';
const dependency=process.env.CENTER_TEST_PGLITE || '@electric-sql/pglite';
const engine=await import(process.env.CENTER_TEST_DATABASE_URL ? (process.env.CENTER_TEST_PG || 'pg') : dependency);
test('database migration and delegated setup lifecycle',async()=>{
 const db=process.env.CENTER_TEST_DATABASE_URL ? new engine.default.Pool({connectionString:process.env.CENTER_TEST_DATABASE_URL}) : new engine.PGlite();
 if(process.env.CENTER_TEST_DATABASE_URL){db.exec=sql=>db.query(sql);db.close=()=>db.end();}
 try {
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY); CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);
 CREATE TABLE orders(id uuid PRIMARY KEY,restaurant_id uuid,total_cents integer,status text,created_at timestamptz DEFAULT now());
 CREATE TABLE order_items(order_id uuid,product_name_snapshot text,quantity numeric);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
 CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
 CREATE TABLE platform_admins(user_id uuid,active boolean);`);
 const source=await readFile(new URL('./center.js',import.meta.url),'utf8');
 const migration=source.match(/await pool.query\(`([\s\S]*?)`\)/)[1];
 await db.exec(migration);await db.exec(migration);
 const company=crypto.randomUUID(),admin=crypto.randomUUID(),owner=crypto.randomUUID(),restaurant=crypto.randomUUID();
 await db.query('INSERT INTO companies VALUES($1)',[company]);
 await db.query("INSERT INTO users(id,company_id,role,status) VALUES($1,$3,'owner','active'),($2,$3,'owner','active')",[admin,owner,company]);
 await db.query('INSERT INTO platform_admins VALUES($1,true)',[admin]);
 for(const [id,key] of [[admin,'admin'],[owner,'owner']])await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[id,crypto.createHash('sha256').update(key).digest('hex')]);
 await db.query('INSERT INTO restaurants VALUES($1,$2,$3)',[restaurant,company,'Restaurant']);
 const handler=createCenterHandler({query:async(sql,args)=>{const q=await db.query(sql,args);return {...q,rowCount:q.rows.length || q.affectedRows || 0};}});
 async function call(path,method,key,payload){const req=Readable.from(payload?[JSON.stringify(payload)]:[]);Object.assign(req,{url:'/api/v1/centers'+path,method,headers:{authorization:'Bearer '+key}});const res={writeHead(status){this.status=status;},end(raw){this.data=JSON.parse(raw);}};await handler(req,res);return res;}
 const created=await call('','POST','admin',{name:'Center'});assert.equal(created.status,201);const c='/'+created.data.center.id;
 assert.equal((await call(c+'/restaurants','PUT','admin',{restaurantId:restaurant,active:true})).status,200);
 assert.equal((await call(c+'/tables','POST','owner',{name:'Before approval'})).status,403);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'approve',userId:owner,restaurantId:restaurant})).status,403);
 assert.equal((await call(c+'/setup','PUT','admin',{action:'approve',userId:owner,restaurantId:restaurant})).status,200);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'complete'})).status,409);
 assert.equal((await call(c+'/tables','POST','owner',{name:'Table 1'})).status,201);
 assert.equal((await call(c+'/setup','PUT','owner',{action:'complete'})).status,200);
 assert.equal((await call(c+'/tables','POST','owner',{name:'After lock'})).status,403);
 assert.equal((await call(c+'/setup','PUT','admin',{action:'approve',userId:owner,restaurantId:restaurant})).status,409);
 assert.equal((await call(c+'/tables','POST','admin',{name:'Admin maintenance'})).status,201);
 assert.equal((await call(c+'/tables','GET','owner')).data.tables.length,2);
 await db.query("UPDATE center_restaurants SET merchant_reference='merchant-1',payment_status='verified',contract_status='signed'");
 const order=crypto.randomUUID();
 await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[order,restaurant]);
 await db.query("INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency) VALUES('pay-1',$1,$2,$3,'merchant-1',1250,'EUR')",[order,created.data.center.id,restaurant]);
 const pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}}),query:(...args)=>db.query(...args)};
 const payment={paymentId:'pay-1',orderId:order,merchantReference:'merchant-1',amountCents:1250,currency:'EUR',status:'paid',refundedCents:0,chargedBackCents:0,paidAt:new Date().toISOString()};
 assert.equal((await releaseCenterPayment(pool,'pay-1',async()=>({...payment,amountCents:1}))).released,false);
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[order])).rows[0].status,'payment_pending');
 await assert.rejects(releaseCenterPayment(pool,'pay-1',async()=>{throw Error('provider unavailable')}),/provider unavailable/);
 assert.equal((await releaseCenterPayment(pool,'pay-1',async()=>payment)).released,true);
 assert.equal((await releaseCenterPayment(pool,'pay-1',async()=>{throw Error('must not reverify')})).alreadyReleased,true);
 assert.equal((await centerKitchenQueue(pool,restaurant)).length,1);
 assert.equal((await centerKitchenQueue(pool,crypto.randomUUID())).length,0);
 const later=crypto.randomUUID();
 await db.query("INSERT INTO orders(id,restaurant_id,total_cents,status) VALUES($1,$2,1250,'payment_pending')",[later,restaurant]);
 await db.query("INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency) VALUES('pay-2',$1,$2,$3,'merchant-1',1250,'EUR')",[later,created.data.center.id,restaurant]);
 assert.equal((await releaseCenterPayment(pool,'pay-2',async()=>({...payment,paymentId:'pay-2',orderId:later,paidAt:new Date(Date.parse(payment.paidAt)+1000).toISOString()}))).released,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,later,'preparing')).reason,'earlier_order_waiting');
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'ready')).ok,false);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'preparing')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'preparing')).alreadyApplied,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,later,'preparing')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,later,'ready')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'ready')).ok,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'ready')).alreadyApplied,true);
 assert.equal((await advanceCenterKitchen(pool,restaurant,order,'preparing')).ok,false);


 }finally{await db.close();}
});

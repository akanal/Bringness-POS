import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {dependency} from './dependency.mjs';
import {migrateReceiptFiles,storedReceiptFile,configureReceiptStorage} from '../../server/receipt-file-storage.js';
import {migrateProductImages,createProductImages,decodeProductImage} from '../../server/product-image-storage.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
async function setup(){
 const {PGlite}=await import(pathToFileURL(dependency('@electric-sql/pglite','SHOP_PGLITE_PATH'))),db=new PGlite();await db.waitReady;
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid);CREATE TABLE orders(id uuid PRIMARY KEY,restaurant_id uuid);CREATE TABLE receipts(id uuid PRIMARY KEY,order_id uuid,fiscal_status text DEFAULT 'pending');
 CREATE TABLE categories(id uuid PRIMARY KEY,restaurant_id uuid);CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid,category_id uuid,name text,price_cents int,tax_rate numeric,image_url text,active boolean DEFAULT true);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);`);
 const company=crypto.randomUUID(),rid=crypto.randomUUID(),order=crypto.randomUUID(),receiptId=crypto.randomUUID(),user=crypto.randomUUID(),token='synthetic-only';
 await db.query('INSERT INTO companies VALUES($1)',[company]);await db.query('INSERT INTO restaurants VALUES($1,$2)',[rid,company]);await db.query('INSERT INTO orders VALUES($1,$2)',[order,rid]);await db.query('INSERT INTO receipts(id,order_id) VALUES($1,$2)',[receiptId,order]);
 await db.query("INSERT INTO users(id,company_id,role,status) VALUES($1,$2,'owner','active')",[user,company]);await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[user,crypto.createHash('sha256').update(token).digest('hex')]);
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 await migrateReceiptFiles(pool);await migrateReceiptFiles(pool);await migrateProductImages(pool);await migrateProductImages(pool);
 const blobs=new Map();let puts=0;
 const store={async putExact(r,b){puts++;blobs.set(r.id,Buffer.from(b));},async getExact(r){return blobs.get(r.id);}};
 return {db,pool,store,blobs,company,rid,receiptId,user,token,puts:()=>puts};
}
async function request(handle,url,{body,token,method=body?'POST':'GET'}={}){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=url;req.method=method;req.headers=token?{authorization:'Bearer '+token}:{};
 const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(bytes){this.bytes=bytes;}};
 assert.equal(await handle(req,res),true);return res;
}
test('receipt archive reuses identical bytes across render callers, isolates formats and rejects corruption/foreign company',async()=>{
 const f=await setup();try{
  let renders=0;const render=async()=>Buffer.from('%PDF-1.7\nsynthetic '+ ++renders+'\n%%EOF');
  const receipt={receipt_id:f.receiptId,company_id:f.company,fiscal_status:'pending'},options={store:f.store,required:true};
  const first=await storedReceiptFile(f.pool,receipt,render,options);
  assert.deepEqual(await storedReceiptFile(f.pool,receipt,render,options),first);assert.equal(renders,1);
  await storedReceiptFile(f.pool,{...receipt,formatA4:true},render,options);assert.equal(renders,2);assert.equal(f.puts(),2);
  await f.db.query("UPDATE receipts SET fiscal_status='signed'");
  await assert.rejects(storedReceiptFile(f.pool,receipt,render,options),{code:'RECEIPT_STORAGE_UNAVAILABLE'});
  await storedReceiptFile(f.pool,{...receipt,fiscal_status:'signed'},render,options);assert.equal(f.puts(),3);
  await f.db.query("UPDATE receipts SET fiscal_status='pending'");
  await assert.rejects(storedReceiptFile(f.pool,{...receipt,company_id:crypto.randomUUID()},render,options),{code:'RECEIPT_STORAGE_UNAVAILABLE'});
  for(const id of f.blobs.keys())f.blobs.set(id,Buffer.from('damaged'));
  await assert.rejects(storedReceiptFile(f.pool,receipt,render,options),{code:'RECEIPT_STORAGE_UNAVAILABLE'});
  await assert.rejects(f.db.query('DELETE FROM pos_receipt_files'),/RECEIPT_FILE_IMMUTABLE/);
 }finally{await f.db.close();}
});
test('receipt provider failure leaves retry open without issuing receipts or payments',async()=>{
 const f=await setup();try{
  const receipt={receipt_id:f.receiptId,company_id:f.company,fiscal_status:'pending'},render=async()=>Buffer.from('%PDF-1.7 synthetic');
  await assert.rejects(storedReceiptFile(f.pool,receipt,render,{required:true,store:{putExact:async()=>{throw Error('offline');}}}),/offline/);
  assert.equal((await f.db.query('SELECT * FROM pos_receipt_files')).rows.length,0);
  await storedReceiptFile(f.pool,receipt,render,{required:true,store:f.store});
  assert.equal((await f.db.query('SELECT * FROM receipts')).rows.length,1);
  await assert.rejects(storedReceiptFile(f.pool,receipt,render,{required:true,store:null}));
 }finally{await f.db.close();}
});
test('actual product routes store image bytes in cloud, preserve image field URL, and revoke old capability on product change',async()=>{
 const f=await setup();try{
  const handle=createProductImages(f.pool,{store:f.store,required:true});
  const response=await request(handle,'/api/v1/products',{token:f.token,body:{restaurantId:f.rid,name:'Test',price:2.5,tax:7,emoji:png}});
  assert.equal(response.status,201);const product=JSON.parse(response.bytes);assert.match(product.emoji,/^\/api\/v1\/product-images\//);assert.equal(product.price,2.5);
  const row=(await f.db.query('SELECT * FROM products')).rows[0];assert.equal(row.image_url,product.emoji);assert.equal(f.puts(),1);
  const read=await request(handle,product.emoji);assert.equal(read.status,200);assert.deepEqual(read.bytes,decodeProductImage(png).bytes);
  const other=createProductImages(f.pool,{store:f.store,required:true});assert.deepEqual((await request(other,product.emoji)).bytes,read.bytes);
  f.blobs.set(product.emoji.split('/').at(-1),Buffer.from('corrupt'));assert.equal((await request(handle,product.emoji)).status,503);
  await f.db.query("UPDATE products SET image_url='🍽️' WHERE id=$1",[product.id]);assert.equal((await request(handle,product.emoji)).status,404);
 }finally{await f.db.close();}
});
test('product auth, category ownership, invalid images and failed provider prevent visible product writes; failed upload consumes allowance',async()=>{
 const f=await setup();try{
  const handle=createProductImages(f.pool,{required:true,store:{putExact:async()=>{throw Error('offline');}}});
  const body={restaurantId:f.rid,name:'Test',price:2,emoji:png};
  assert.equal((await request(handle,'/api/v1/products',{body})).status,401);
  assert.equal((await request(handle,'/api/v1/products',{token:f.token,body:{...body,restaurantId:crypto.randomUUID()}})).status,403);
  assert.equal((await request(handle,'/api/v1/products',{token:f.token,body:{...body,categoryId:crypto.randomUUID()}})).status,400);
  assert.equal((await request(handle,'/api/v1/products',{token:f.token,body:{...body,emoji:'data:image/png;base64,AAAA'}})).status,400);
  assert.equal((await request(handle,'/api/v1/products',{token:f.token,body})).status,503);
  assert.equal((await f.db.query('SELECT * FROM products')).rows.length,0);assert.equal((await f.db.query('SELECT * FROM pos_product_image_attempts')).rows.length,1);
  await f.db.query("UPDATE users SET role='waiter'");assert.equal((await request(handle,'/api/v1/products',{token:f.token,body})).status,403);
 }finally{await f.db.close();}
});

test('actual PDF renderer and a second caller reuse the archived original instead of rerendering',async()=>{
 const f=await setup();try{
  await f.db.exec('CREATE TABLE order_items(id uuid,order_id uuid,product_id uuid,product_name_snapshot text,unit_price_cents int,tax_rate_snapshot numeric,quantity numeric);CREATE TABLE payments(id uuid,order_id uuid,method text,amount_cents int,created_at timestamptz);');
  const {renderPaymentReceipt}=await import('../../server/payment-receipt-core.js');
  const {default:PDFDocument}=await import('pdfkit');const {default:QRCode}=await import('qrcode');
  const receipt={receipt_id:f.receiptId,company_id:f.company,order_id:crypto.randomUUID(),public_token:crypto.randomUUID(),receipt_number:'TEST',issued_at:new Date(),total_cents:0,restaurant_name:'Synthetic',fiscal_status:'pending'};
  configureReceiptStorage({required:true,store:f.store});
  const first=await renderPaymentReceipt(f.pool,PDFDocument,QRCode,(_r,t)=>'https://example.test/beleg/'+t,{headers:{}},receipt);
  assert.equal(first.subarray(0,5).toString(),'%PDF-');
  const second=await renderPaymentReceipt(f.pool,PDFDocument,{toBuffer(){throw Error('Must not render twice');}},()=>{throw Error('Must not render twice');},{headers:{}},receipt);
  assert.deepEqual(second,first);assert.equal(f.puts(),1);
 }finally{configureReceiptStorage({required:false,store:null});await f.db.close();}
});
test('product daily upload cap blocks provider calls while ordinary emoji products stay unchanged',async()=>{
 const f=await setup();try{
  const handle=createProductImages(f.pool,{store:f.store,required:true});
  await f.db.query('INSERT INTO pos_product_image_attempts(id,company_id) SELECT gen_random_uuid(),$1 FROM generate_series(1,20)',[f.company]);
  const body={restaurantId:f.rid,name:'Test',price:1,emoji:png};
  assert.equal((await request(handle,'/api/v1/products',{token:f.token,body})).status,429);assert.equal(f.puts(),0);
  const response=await request(handle,'/api/v1/products',{token:f.token,body:{...body,emoji:'🍽️'}});assert.equal(response.status,201);assert.equal(JSON.parse(response.bytes).emoji,'🍽️');assert.equal(f.puts(),0);
 }finally{await f.db.close();}
});

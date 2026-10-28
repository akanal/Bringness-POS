import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateLegacyMedia} from '../../server/idrive-legacy-media.js';
import {migrateProductImages,createProductImages} from '../../server/product-image-storage.js';
import {readDisplayMedia} from '../../server/display-media-storage.js';
const company='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=','base64');
async function setup(){
 const db=new PGlite();await db.waitReady;
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid);CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,image_url text,active boolean DEFAULT true);CREATE TABLE pos_display_media(id uuid PRIMARY KEY,restaurant_id uuid,mime text,content bytea,storage jsonb,byte_length integer);`);
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 await db.query('INSERT INTO companies VALUES($1)',[company]);await db.query('INSERT INTO restaurants VALUES($1,$2)',[rid,company]);await migrateProductImages(pool);
 await db.query('INSERT INTO pos_display_media VALUES($1,$2,$3,$4,NULL,NULL)',[id,rid,'image/png',png]);
 await db.query('INSERT INTO products(id,restaurant_id,image_url) VALUES($1,$2,$3)',[id,rid,'data:image/png;base64,'+png.toString('base64')]);
 const blobs=new Map();let puts=0;
 const store={async putExact(r,b){puts++;blobs.set(r.company+r.id,Buffer.from(b));},async getExact(r){return blobs.get(r.company+r.id);}};
 return {db,pool,store,puts:()=>puts};
}
test('inventory does not contact provider or mutate local bytes',async()=>{
 const f=await setup();try{assert.deepEqual(await migrateLegacyMedia(f.pool,null),{scanned:2,migrated:0,verifiedBytes:0,remaining:2});assert.equal(f.puts(),0);assert.deepEqual(Buffer.from((await f.db.query('SELECT content FROM pos_display_media')).rows[0].content),png);}finally{await f.db.close();}
});
test('verified migration keeps display identity, serves product image and retry is no-op',async()=>{
 const f=await setup();try{
 const result=await migrateLegacyMedia(f.pool,f.store,{apply:true});assert.equal(result.migrated,2);assert.equal(result.remaining,0);
 const row=(await f.db.query('SELECT * FROM pos_display_media')).rows[0];assert.equal(row.content,null);assert.deepEqual(await readDisplayMedia(f.store,row,{rid,id}),png);
 const handle=createProductImages(f.pool,{store:f.store,required:true});const res={writeHead(s){this.status=s},end(b){this.bytes=b}};
 await handle({url:'/api/v1/product-images/'+id,method:'GET'},res);assert.equal(res.status,200);assert.deepEqual(res.bytes,png);
 assert.equal((await migrateLegacyMedia(f.pool,f.store,{apply:true})).migrated,0);assert.equal(f.puts(),2);
 }finally{await f.db.close();}
});
test('corrupt readback rolls back local removal and can be retried',async()=>{
 const f=await setup();try{
 await assert.rejects(migrateLegacyMedia(f.pool,{...f.store,getExact:async()=>Buffer.from('bad')},{apply:true}),/READBACK_MISMATCH/);
 assert.deepEqual(Buffer.from((await f.db.query('SELECT content FROM pos_display_media')).rows[0].content),png);
 assert.equal((await f.db.query('SELECT storage FROM pos_display_media')).rows[0].storage,null);
 assert.equal((await migrateLegacyMedia(f.pool,f.store,{apply:true})).remaining,0);
 }finally{await f.db.close();}
});
test('provider failure retains source and batch limit allows continuation',async()=>{
 const f=await setup();try{
 await assert.rejects(migrateLegacyMedia(f.pool,{putExact:async()=>{throw Error('provider down')}},{apply:true}),/provider down/);
 assert.equal((await migrateLegacyMedia(f.pool,f.store,{apply:true,limit:1})).remaining,1);
 assert.equal((await migrateLegacyMedia(f.pool,f.store,{apply:true,limit:1})).remaining,0);
 }finally{await f.db.close();}
});

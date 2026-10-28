import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {dependency} from './dependency.mjs';
import {migrateDisplayMediaStorage,storeDisplayMedia,readDisplayMedia} from '../../server/display-media-storage.js';
async function setup(){
 const {PGlite}=await import(pathToFileURL(dependency('@electric-sql/pglite','SHOP_PGLITE_PATH'))),db=new PGlite();await db.waitReady;
 await db.exec('CREATE TABLE restaurants(id uuid PRIMARY KEY);CREATE TABLE pos_display_media(id uuid PRIMARY KEY,restaurant_id uuid,mime text,content bytea NOT NULL)');
 const rid=crypto.randomUUID();await db.query('INSERT INTO restaurants VALUES($1)',[rid]);
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};await migrateDisplayMediaStorage(pool);await migrateDisplayMediaStorage(pool);
 const blobs=new Map(),store={async putExact(record,bytes){blobs.set(record.id,Buffer.from(bytes));},async getExact(record){return blobs.get(record.id);}};
 return {db,pool,rid,blobs,store};
}
test('new display bytes live only in cloud; existing bytes remain readable and cross-venue references fail',async()=>{
 const f=await setup();try{
  const content=Buffer.from([137,80,78,71,13,10,26,10]);
  const saved=await storeDisplayMedia(f.pool,f.store,{rid:f.rid,mime:'image/png',content});
  const row=(await f.db.query('SELECT * FROM pos_display_media WHERE id=$1',[saved.id])).rows[0];
  assert.equal(row.content,null);assert.equal(row.byte_length,content.length);
  assert.deepEqual(await readDisplayMedia(f.store,row,{rid:f.rid,id:saved.id}),content);
  await assert.rejects(readDisplayMedia(f.store,row,{rid:crypto.randomUUID(),id:saved.id}),{status:503});
  f.blobs.set(saved.id,Buffer.from('broken'));
  await assert.rejects(readDisplayMedia(f.store,row,{rid:f.rid,id:saved.id}),{status:503});
  assert.deepEqual(await readDisplayMedia(null,{content,storage:null},{rid:f.rid,id:saved.id}),content);
 }finally{await f.db.close();}
});
test('failed provider writes consume durable allowance without creating visible media; daily quota blocks provider work',async()=>{
 const f=await setup();try{
  const input={rid:f.rid,mime:'image/png',content:Buffer.from([137,80,78,71,13,10,26,10])};let calls=0;
  const failed={putExact:async()=>{calls++;throw Error('provider');}};
  await assert.rejects(storeDisplayMedia(f.pool,failed,input),{status:503});
  assert.equal((await f.db.query('SELECT * FROM pos_display_media')).rows.length,0);
  assert.equal((await f.db.query('SELECT * FROM pos_display_upload_attempts')).rows.length,1);
  for(let n=1;n<20;n++)await f.db.query('INSERT INTO pos_display_upload_attempts(id,restaurant_id,byte_length) VALUES($1,$2,8)',[crypto.randomUUID(),f.rid]);
  await assert.rejects(storeDisplayMedia(f.pool,failed,input),{status:429});assert.equal(calls,1);
  await assert.rejects(storeDisplayMedia(f.pool,null,input),{status:503});
 }finally{await f.db.close();}
});

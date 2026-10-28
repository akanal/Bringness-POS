import crypto from 'node:crypto';
import {decodeProductImage} from './product-image-storage.js';
import {matchesDisplayMedia} from './display-media-type.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Operator-only: never called at startup or exposed through HTTP. Existing readers
// must be deployed before apply. Each row is atomic; a retry uses the same key.
export async function migrateLegacyMedia(pool,store,{apply=false,limit=100}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('INVALID_LIMIT');
 if(apply&&!store)throw Error('STORAGE_REQUIRED');
 const result={scanned:0,migrated:0,verifiedBytes:0,remaining:0};
 for(const kind of ['display','product']){
  let after='00000000-0000-0000-0000-000000000000';
  while(result.scanned<limit){
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout='30s'");
    const sql=kind==='display'
     ? 'SELECT id,restaurant_id AS company,mime,content FROM pos_display_media WHERE storage IS NULL AND content IS NOT NULL AND id>$1 ORDER BY id LIMIT 1 FOR UPDATE'
     : "SELECT p.id,r.company_id AS company,p.image_url FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.image_url LIKE 'data:%' AND p.id>$1 ORDER BY p.id LIMIT 1 FOR UPDATE OF p FOR SHARE OF r";
    const row=(await db.query(sql,[after])).rows[0];
    if(!row){await db.query('COMMIT');break;}
    after=row.id;result.scanned++;
    if(!apply){await db.query('COMMIT');continue;}
    const picture=kind==='display'?{bytes:Buffer.from(row.content),mime:row.mime}:decodeProductImage(row.image_url);
    if(!picture||!picture.bytes.length||picture.bytes.length>(kind==='display'?26214400:5242880)||!matchesDisplayMedia(picture.mime,picture.bytes))throw Error('INVALID_LEGACY_MEDIA');
    const record={company:row.company,id:row.id,sha:sha(picture.bytes),size:picture.bytes.length,mime:picture.mime,requestDigest:sha(JSON.stringify(['legacy-media-v1',kind,row.company,row.id,sha(picture.bytes)]))};
    await store.putExact(record,picture.bytes);
    const back=await store.getExact(record);
    if(!Buffer.isBuffer(back)||!back.equals(picture.bytes))throw Error('READBACK_MISMATCH');
    if(kind==='display'){
     await db.query('UPDATE pos_display_media SET storage=$2,byte_length=$3,content=NULL WHERE id=$1',[row.id,record,record.size]);
    }else{
     // Share the existing product-image quota lock. Migration must not silently
     // overfill an account or overwrite a conflicting image identity.
     await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['product-images:'+row.company]);
     const usage=(await db.query('SELECT coalesce(sum(byte_length),0)::bigint bytes FROM pos_product_images WHERE company_id=$1',[row.company])).rows[0];
     if(Number(usage.bytes)+record.size>104857600)throw Error('PRODUCT_IMAGE_QUOTA');
     await db.query('INSERT INTO pos_product_images(id,product_id,company_id,storage,byte_length) VALUES($1,$1,$2,$3,$4)',[row.id,row.company,record,record.size]);
     await db.query('UPDATE products SET image_url=$2 WHERE id=$1',[row.id,'/api/v1/product-images/'+row.id]);
    }
    await db.query('COMMIT');result.migrated++;result.verifiedBytes+=record.size;
   }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
 }
 result.remaining=Number((await pool.query("SELECT (SELECT count(*) FROM pos_display_media WHERE storage IS NULL AND content IS NOT NULL)+(SELECT count(*) FROM products WHERE image_url LIKE 'data:%') AS count")).rows[0].count);
 return result;
}

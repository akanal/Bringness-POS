import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const unavailable=()=>Object.assign(Error('Medienspeicher nicht verfügbar'),{status:503});
export async function migrateDisplayMediaStorage(pool){
 await pool.query('ALTER TABLE pos_display_media ADD COLUMN IF NOT EXISTS storage jsonb');
 await pool.query('ALTER TABLE pos_display_media ADD COLUMN IF NOT EXISTS byte_length integer');
 await pool.query('ALTER TABLE pos_display_media ALTER COLUMN content DROP NOT NULL');
 await pool.query(`CREATE TABLE IF NOT EXISTS pos_display_upload_attempts(id uuid PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 26214400),created_at timestamptz NOT NULL DEFAULT now())`);
}
export async function storeDisplayMedia(pool,store,{rid,mime,content}){
 if(!store)throw unavailable();
 const id=crypto.randomUUID(),digest=sha(content),record={company:rid,id,sha:digest,requestDigest:sha(JSON.stringify([rid,id,mime,content.length,digest])),size:content.length,mime};
 const reserve=await pool.connect();try{
  await reserve.query('BEGIN');await reserve.query("SET LOCAL statement_timeout='5s'");
  await reserve.query('SELECT pg_advisory_xact_lock(741920682)');
  const count=(await reserve.query("SELECT count(*) FILTER(WHERE restaurant_id=$1)::integer AS venue,count(*)::integer AS total FROM pos_display_upload_attempts WHERE created_at>now()-interval '24 hours'",[rid])).rows[0];
  if(count.venue>=20||count.total>=100)throw Object.assign(Error('Uploadlimit erreicht. Bitte später erneut versuchen.'),{status:429});
  await reserve.query('INSERT INTO pos_display_upload_attempts(id,restaurant_id,byte_length) VALUES($1,$2,$3)',[id,rid,content.length]);await reserve.query('COMMIT');
 }catch(e){await reserve.query('ROLLBACK');throw e;}finally{reserve.release();}
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");await db.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[rid]);
  const q=(await db.query('SELECT coalesce(sum(coalesce(byte_length,octet_length(content))),0)::bigint bytes FROM pos_display_media WHERE restaurant_id=$1',[rid])).rows[0];
  if(Number(q.bytes)+content.length>250*1024*1024)throw Object.assign(Error('Medienlimit von 250 MB erreicht'),{status:413});
  try{await store.putExact(record,content);}catch{throw unavailable();}
  await db.query('INSERT INTO pos_display_media(id,restaurant_id,mime,content,storage,byte_length) VALUES($1,$2,$3,NULL,$4,$5)',[id,rid,mime,record,content.length]);
  await db.query('COMMIT');return {id,type:mime.startsWith('video/')?'video':'image'};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function readDisplayMedia(store,row,{rid,id}){
 if(!row.storage)return Buffer.from(row.content);
 if(!store||row.storage.company!==rid||row.storage.id!==id||row.storage.mime!==row.mime||row.storage.size!==row.byte_length)throw unavailable();
 try{const bytes=await store.getExact(row.storage);if(bytes.length!==row.byte_length||sha(bytes)!==row.storage.sha)throw unavailable();return bytes;}catch{throw unavailable();}
}

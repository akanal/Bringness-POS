import crypto from 'node:crypto';
import {matchesDisplayMedia} from './display-media-type.js';
import {readJsonObject} from './http-body.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
const fail=(status,message)=>Object.assign(Error(message),{status});
export function decodeProductImage(value){
 if(typeof value!=='string')throw fail(400,'Ungültiges Produktbild');
 if(!value.startsWith('data:')){if(value.length>2048)throw fail(400,'Ungültiges Produktbild');return null;}
 const match=value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match||match[2].length>6990508)throw fail(400,'Ungültiges Produktbild');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.toString('base64')!==match[2]||bytes.length>5242880||!matchesDisplayMedia(match[1],bytes))throw fail(400,'Ungültiges Produktbild');
 return {bytes,mime:match[1]};
}
export async function migrateProductImages(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS pos_product_image_attempts(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),created_at timestamptz NOT NULL DEFAULT now())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS pos_product_images(id uuid PRIMARY KEY,product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,company_id uuid NOT NULL REFERENCES companies(id),storage jsonb NOT NULL,byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 5242880));`);
}
export function createProductImages(pool,{store,required=false}={}){
 const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));return true;};
 return async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  const image=path.match(/^\/api\/v1\/product-images\/([a-f0-9-]{36})$/);
  if(image){
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Methode nicht erlaubt'});
   if(!uuid(image[1]))return send(res,404,{error:'Bild nicht gefunden'});
   try{
    const row=(await pool.query(`SELECT i.* FROM pos_product_images i JOIN products p ON p.id=i.product_id JOIN restaurants r ON r.id=p.restaurant_id WHERE i.id=$1 AND p.active=true AND r.company_id=i.company_id AND p.image_url=$2`,[image[1],path])).rows[0];
    if(!row)return send(res,404,{error:'Bild nicht gefunden'});
    if(!store||row.storage.id!==row.id||row.storage.company!==row.company_id||row.storage.size!==row.byte_length||!['image/png','image/jpeg','image/webp'].includes(row.storage.mime))throw fail(503,'Bild nicht verfügbar');
    const bytes=await store.getExact(row.storage);
    if(!Buffer.isBuffer(bytes)||bytes.length!==row.byte_length||sha(bytes)!==row.storage.sha)throw fail(503,'Bild nicht verfügbar');
    res.writeHead(200,{'content-type':row.storage.mime,'content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:bytes);return true;
   }catch{return send(res,503,{error:'Bild derzeit nicht verfügbar'});}
  }
  if(!required||path!=='/api/v1/products'||req.method!=='POST')return false;
  try{
   const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
   const actor=token?(await pool.query("SELECT u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[sha(token)])).rows[0]:null;
   if(!actor)return send(res,401,{error:'Nicht angemeldet'});
   if(!['owner','admin','manager'].includes(actor.role))return send(res,403,{error:'Kein Verwaltungszugang'});
   const b=await readJsonObject(req,{maxBytes:7100000});
   const name=String(b.name||'').trim(),price=Math.round(Number(b.price)*100),tax=Number(b.tax??19),emoji=b.emoji||'🍽️';
   if(!uuid(b.restaurantId)||(b.categoryId&&!uuid(b.categoryId))||!name||name.length>200||!Number.isSafeInteger(price)||price<0||price>2147483647||!Number.isFinite(tax)||tax<0||tax>100)throw fail(400,'Ungültige Produktdaten');
   const picture=decodeProductImage(emoji);
   const db=await pool.connect();let z;
   const verifyActor=async()=>{const check=await db.query("SELECT u.company_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.company_id=$2 AND u.role IN ('owner','admin','manager') AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,s",[sha(token),actor.company_id]);if(!check.rows.length)throw fail(403,'Verwaltungszugang nicht mehr aktiv');};
   try{
    await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
    await verifyActor();
    const venue=(await db.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR UPDATE',[b.restaurantId,actor.company_id])).rows[0];
    if(!venue)throw fail(403,'Betrieb nicht erlaubt');
    if(b.categoryId&&!(await db.query('SELECT id FROM categories WHERE id=$1 AND restaurant_id=$2',[b.categoryId,b.restaurantId])).rows.length)throw fail(400,'Kategorie nicht im Betrieb');
    let record=null,url=emoji;
    if(picture){
     if(!store)throw fail(503,'Bildspeicher nicht verfügbar');
     // Persist allowance before provider access, including failed attempts.
     await db.query('SELECT pg_advisory_xact_lock(741920683)');
     const count=(await db.query("SELECT count(*) FILTER(WHERE company_id=$1)::int own,count(*)::int total FROM pos_product_image_attempts WHERE created_at>now()-interval '24 hours'",[actor.company_id])).rows[0];
     if(count.own>=20||count.total>=100)throw fail(429,'Uploadlimit erreicht');
     const id=crypto.randomUUID();
     await db.query('INSERT INTO pos_product_image_attempts(id,company_id) VALUES($1,$2)',[id,actor.company_id]);
     await db.query('COMMIT');await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
     // Recheck ownership after the durable attempt reservation.
     await verifyActor();
     if(!(await db.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR UPDATE',[b.restaurantId,actor.company_id])).rows.length)throw fail(403,'Betrieb nicht erlaubt');
     await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['product-images:'+actor.company_id]);
     const usage=(await db.query('SELECT coalesce(sum(byte_length),0)::bigint bytes FROM pos_product_images WHERE company_id=$1',[actor.company_id])).rows[0];
     if(Number(usage.bytes)+picture.bytes.length>104857600)throw fail(413,'Bildspeicherlimit erreicht');
     record={company:actor.company_id,id,sha:sha(picture.bytes),size:picture.bytes.length,mime:picture.mime,requestDigest:sha(JSON.stringify([actor.company_id,b.restaurantId,id]))};
     try{await store.putExact(record,picture.bytes);}catch{throw fail(503,'Bildspeicher nicht verfügbar');}
     url='/api/v1/product-images/'+id;
    }
    z=(await db.query('INSERT INTO products(restaurant_id,category_id,name,price_cents,tax_rate,image_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[b.restaurantId,b.categoryId||null,name,price,tax,url])).rows[0];
    if(record)await db.query('INSERT INTO pos_product_images(id,product_id,company_id,storage,byte_length) VALUES($1,$2,$3,$4,$5)',[record.id,z.id,actor.company_id,record,record.size]);
    await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
   return send(res,201,{id:z.id,restaurantId:z.restaurant_id,categoryId:z.category_id,name:z.name,price:z.price_cents/100,tax:Number(z.tax_rate),emoji:z.image_url});
  }catch(e){return send(res,e.status||503,{error:e.status?e.message:'Produkt konnte nicht gespeichert werden'});}
 };
}

import crypto from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {offerId} from '../apps/web/public/shop/offer-policy.js';
export const imageLimits=Object.freeze({maxBytes:5*1024*1024,maxPixels:16000000,maxDimension:6000,maxUploadsPerDay:20});
const fail=c=>{throw shopError(c);},digest=b=>crypto.createHash('sha256').update(b).digest('hex');
export function marketplaceImageKey(company,id,sha){
 if(!uuid(company)||!uuid(id)||!/^[a-f0-9]{64}$/.test(sha))fail('IMAGE_UNAVAILABLE');
 return `marketplace/product-images/${company}/${id}/${sha}`;
}
function dimensions(bytes,mime){
 if(mime==='image/png'&&bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(8)===13)return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
  let i=2;while(i+4<=bytes.length){if(bytes[i++]!==255)break;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===0xda||marker===0xd9)break;const n=bytes.readUInt16BE(i);if(n<2||i+n>bytes.length)break;if([0xc0,0xc1,0xc2].includes(marker)&&n>=8)return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];i+=n;}
 }
 fail('INVALID_IMAGE');
}
export async function normalizeMarketplaceImage(bytes,mime){
 if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>imageLimits.maxBytes)fail('INVALID_IMAGE');
 const [width,height]=dimensions(bytes,mime);
 if(!width||!height||width>imageLimits.maxDimension||height>imageLimits.maxDimension||width*height>imageLimits.maxPixels)fail('INVALID_IMAGE');
 try{
  const image=await loadImage(bytes);if(image.width!==width||image.height!==height)fail('INVALID_IMAGE');
  const scale=Math.min(1,1600/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const canvas=createCanvas(w,h);canvas.getContext('2d').drawImage(image,0,0,w,h);
  const body=await canvas.encode('png');if(body.length>imageLimits.maxBytes)fail('INVALID_IMAGE');
  return {body,width:w,height:h,sha:digest(body),size:body.length,mime:'image/png'};
 }catch{fail('INVALID_IMAGE');}
}
export async function migrateMarketplaceImages(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_market_image_intents(company_id uuid NOT NULL REFERENCES companies(id),id uuid NOT NULL UNIQUE,offer_id text NOT NULL,expected_revision integer NOT NULL CHECK(expected_revision>=0),request_digest text NOT NULL,sha256 text NOT NULL,byte_length integer NOT NULL CHECK(byte_length BETWEEN 8 AND 5242880),width integer NOT NULL,height integer NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,id),FOREIGN KEY(company_id,offer_id) REFERENCES shop_seller_offers(company_id,id))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_market_images(company_id uuid NOT NULL UNIQUE,offer_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),image_id uuid,PRIMARY KEY(company_id,offer_id),FOREIGN KEY(company_id,offer_id) REFERENCES shop_seller_offers(company_id,id),FOREIGN KEY(company_id,image_id) REFERENCES shop_market_image_intents(company_id,id))`);
}
async function transaction(pool,token,fn){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const hash=sessionHash(token),a=await shopActor(db,hash);await db.query('SELECT id FROM companies WHERE id=$1 FOR NO KEY UPDATE',[a.company_id]);const final=await shopActor(db,hash,true);if(a.company_id!==final.company_id)fail('ACCOUNT_CHANGED');const result=await fn(db,a.company_id);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
async function owner(db,company,id){if(!offerId(id))fail('INVALID_IMAGE');const r=(await db.query("SELECT id FROM shop_seller_offers WHERE company_id=$1 AND id=$2 AND state='draft' FOR SHARE",[company,id])).rows[0];if(!r)fail('OFFER_NOT_FOUND');const seller=(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[company])).rows[0];if(!seller)fail('SELLER_NOT_APPROVED');}
const view=r=>({offerId:r.offer_id,revision:r.revision,imageId:r.image_id||null,url:r.image_id?'/api/v1/shop/marketplace/images/public/'+r.image_id:null});
export function createMarketplaceImages(pool,store){
 return {
  async own({token,id}){return transaction(pool,token,async(db,company)=>{await owner(db,company,id);const r=(await db.query('SELECT * FROM shop_market_images WHERE company_id=$1 AND offer_id=$2',[company,id])).rows[0];return r?view(r):{offerId:id,revision:0,imageId:null,url:null};});},
  async upload({token,id,requestId,expectedRevision,bytes,mime}){
   if(!uuid(requestId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>2147483646)fail('INVALID_IMAGE');
   // Authorize BEFORE decoding untrusted files; HTTP also limits concurrent decoders.
   await transaction(pool,token,(db,company)=>owner(db,company,id));
   const image=await normalizeMarketplaceImage(bytes,mime),requestDigest=digest(JSON.stringify([id,expectedRevision,mime,digest(bytes)]));let company;
   const prior=await transaction(pool,token,async(db,c)=>{
    company=c;await owner(db,c,id);await db.query('SELECT pg_advisory_xact_lock(741920682)');
    const intent=(await db.query('SELECT * FROM shop_market_image_intents WHERE company_id=$1 AND id=$2',[c,requestId])).rows[0];
    if(intent&&intent.request_digest!==requestDigest)fail('IMAGE_CONFLICT');
    const row=(await db.query('SELECT * FROM shop_market_images WHERE company_id=$1 AND offer_id=$2',[c,id])).rows[0];
    if(row?.image_id===requestId)return {...view(row),replay:true};
    if((row?.revision||0)!==expectedRevision)fail('REVISION_CONFLICT');
    if(!intent){const usage=(await db.query("SELECT count(*) FILTER(WHERE company_id=$1)::int AS account,count(*)::int AS total FROM shop_market_image_intents WHERE created_at>clock_timestamp()-interval '24 hours'",[c])).rows[0];
     const total=Number((await db.query('SELECT coalesce(sum(byte_length),0) AS bytes FROM shop_market_image_intents WHERE company_id=$1',[c])).rows[0].bytes);
     if(usage.account>=20||usage.total>=200||total+image.size>100*1024*1024)fail('IMAGE_QUOTA');
     await db.query('INSERT INTO shop_market_image_intents(company_id,id,offer_id,expected_revision,request_digest,sha256,byte_length,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[c,requestId,id,expectedRevision,requestDigest,image.sha,image.size,image.width,image.height]);
    }else if(intent.sha256!==image.sha)fail('IMAGE_CONFLICT');
    return null;
   });if(prior)return prior;
   await store.putExact({company,id:requestId,...image,requestDigest},image.body);
   return transaction(pool,token,async(db,c)=>{
    if(c!==company)fail('ACCOUNT_CHANGED');await owner(db,c,id);
    const row=(await db.query('SELECT * FROM shop_market_images WHERE company_id=$1 AND offer_id=$2',[c,id])).rows[0];
    if(row?.image_id===requestId)return {...view(row),replay:true};
    if((row?.revision||0)!==expectedRevision)fail('REVISION_CONFLICT');
    const r=(await db.query('INSERT INTO shop_market_images(company_id,offer_id,revision,image_id) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,offer_id) DO UPDATE SET revision=excluded.revision,image_id=excluded.image_id RETURNING *',[c,id,expectedRevision+1,requestId])).rows[0];return {...view(r),replay:false};
   });
  },
  async remove({token,id,expectedRevision}){
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||expectedRevision>2147483646)fail('INVALID_IMAGE');
   return transaction(pool,token,async(db,c)=>{await owner(db,c,id);const r=(await db.query('SELECT * FROM shop_market_images WHERE company_id=$1 AND offer_id=$2',[c,id])).rows[0];if(!r)fail('IMAGE_NOT_FOUND');if(!r.image_id&&r.revision===expectedRevision+1)return {...view(r),replay:true};if(r.revision!==expectedRevision)fail('REVISION_CONFLICT');return view((await db.query('UPDATE shop_market_images SET image_id=NULL,revision=revision+1 WHERE company_id=$1 AND offer_id=$2 RETURNING *',[c,id])).rows[0]);});
  },
  async public({id}){
   if(!uuid(id))fail('IMAGE_NOT_FOUND');
   const select=`SELECT i.* FROM shop_market_image_intents i JOIN shop_market_images m ON m.company_id=i.company_id AND m.image_id=i.id JOIN shop_market_publications p ON p.company_id=m.company_id AND p.id=m.offer_id JOIN shop_seller_offers d ON d.company_id=p.company_id AND d.id=p.id JOIN shop_market_sellers s ON s.company_id=p.company_id WHERE i.id=$1 AND p.state='published' AND d.state='draft' AND s.status='approved'`;
   const r=(await pool.query(select,[id])).rows[0];if(!r)fail('IMAGE_NOT_FOUND');
   const body=await store.getExact({company:r.company_id,id:r.id,sha:r.sha256,requestDigest:r.request_digest,size:r.byte_length,mime:'image/png'});
   if(!(await pool.query(select,[id])).rows.length)fail('IMAGE_NOT_FOUND');return body;
  }
 };
}

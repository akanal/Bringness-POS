import {sellerListFilters} from '../apps/web/public/shop/seller-list-policy.js';
import {categories,categoryMatches} from '../apps/web/public/shop/departments.js';
import crypto from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {offerId,validateOffer} from '../apps/web/public/shop/offer-policy.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const error=code=>{throw shopError(code);};
export async function migrateSellerDrafts(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_seller_offers(company_id uuid NOT NULL REFERENCES companies(id),id text NOT NULL CHECK(length(id)=42),revision integer NOT NULL CHECK(revision>0),state text NOT NULL CHECK(state IN ('draft','archived')),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_seller_requests(company_id uuid NOT NULL REFERENCES companies(id),request_id uuid NOT NULL,digest text NOT NULL CHECK(length(digest)=64),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,request_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_seller_offer_history(company_id uuid NOT NULL,id text NOT NULL,revision integer NOT NULL,action text NOT NULL CHECK(action IN ('save','archive','restore')),state text NOT NULL,payload jsonb NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(company_id,id,revision),FOREIGN KEY(company_id,id) REFERENCES shop_seller_offers(company_id,id))`);
}
function present(row){return {id:row.id,revision:row.revision,state:row.state,offer:validateOffer(row.payload),createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),canPublish:false};}
export function sellerCommand(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['id','requestId','expectedRevision','action','offer'].includes(k))||!offerId(value.id)||!uuid(value.requestId)||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||value.expectedRevision>2147483646||!['save','archive','restore'].includes(value.action))error('INVALID_REQUEST');
 if(value.action!=='save'&&(value.expectedRevision===0||Object.hasOwn(value,'offer')))error('INVALID_REQUEST');
 let offer;if(value.action==='save'){try{offer=validateOffer(value.offer);}catch{error('INVALID_OFFER');}}
 return {id:value.id,requestId:value.requestId,expectedRevision:value.expectedRevision,action:value.action,...(offer?{offer}:{})};
}
async function transaction(pool,token,write,fn){
 const hash=sessionHash(token),db=await pool.connect();
 try{
  await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query("SET LOCAL statement_timeout='5s'");
  const first=await shopActor(db,hash);
  if(write)await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[first.company_id]);
  const actor=await shopActor(db,hash,true);if(actor.company_id!==first.company_id)error('ACCOUNT_CHANGED');
  const actorId=(await db.query('SELECT user_id FROM sessions WHERE token_hash=$1',[hash])).rows[0]?.user_id;if(!actorId)error('UNAUTHORIZED');
  const result=await fn(db,actor.company_id,actorId);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function writeSellerDraft(pool,{token,command:input}){
 const command=sellerCommand(input),digest=crypto.createHash('sha256').update(JSON.stringify(command)).digest('hex');
 return transaction(pool,token,true,async(db,company,actorId)=>{
  const old=(await db.query('SELECT digest,result FROM shop_seller_requests WHERE company_id=$1 AND request_id=$2',[company,command.requestId])).rows[0];
  if(old){if(old.digest!==digest)error('REQUEST_CONFLICT');return {...old.result,replay:true};}
  const row=(await db.query('SELECT * FROM shop_seller_offers WHERE company_id=$1 AND id=$2 FOR UPDATE',[company,command.id])).rows[0];
  if((row?.revision??0)!==command.expectedRevision)error('REVISION_CONFLICT');
  if(!row&&command.action!=='save')error('OFFER_NOT_FOUND');
  if(row&&command.action==='save'&&row.state==='archived')error('OFFER_ARCHIVED');
  if(row&&((command.action==='archive'&&row.state!=='draft')||(command.action==='restore'&&row.state!=='archived')))error('REVISION_CONFLICT');
  if(!row&&Number((await db.query('SELECT count(*) AS count FROM shop_seller_offers WHERE company_id=$1',[company])).rows[0].count)>=200)error('OFFER_LIMIT');
  if(Number((await db.query('SELECT count(*) AS count FROM shop_seller_requests WHERE company_id=$1',[company])).rows[0].count)>=10000)error('CHANGE_LIMIT');
  const state=command.action==='archive'?'archived':'draft',payload=command.offer??row.payload,revision=command.expectedRevision+1;
  let saved;
  if(row)saved=(await db.query('UPDATE shop_seller_offers SET revision=$3,state=$4,payload=$5,updated_at=clock_timestamp() WHERE company_id=$1 AND id=$2 RETURNING *',[company,command.id,revision,state,JSON.stringify(payload)])).rows[0];
  else saved=(await db.query('INSERT INTO shop_seller_offers(company_id,id,revision,state,payload) VALUES($1,$2,$3,$4,$5) RETURNING *',[company,command.id,revision,state,JSON.stringify(payload)])).rows[0];
  await db.query('INSERT INTO shop_seller_offer_history(company_id,id,revision,action,state,payload,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[company,command.id,revision,command.action,state,JSON.stringify(payload),actorId]);
  const result={...present(saved),replay:false};
  await db.query('INSERT INTO shop_seller_requests(company_id,request_id,digest,result) VALUES($1,$2,$3,$4)',[company,command.requestId,digest,JSON.stringify(result)]);return result;
 });
}
export async function readSellerDraft(pool,{token,id,revision=null}){
 if(!offerId(id)||revision!==null&&(!Number.isSafeInteger(revision)||revision<1))error('INVALID_REQUEST');
 return transaction(pool,token,false,async(db,company)=>{
  const row=(await db.query('SELECT * FROM shop_seller_offers WHERE company_id=$1 AND id=$2',[company,id])).rows[0];if(!row)error('OFFER_NOT_FOUND');
  const result=present(row);if(revision!==null){const past=(await db.query('SELECT payload FROM shop_seller_offer_history WHERE company_id=$1 AND id=$2 AND revision=$3',[company,id,revision])).rows[0];if(!past)error('OFFER_NOT_FOUND');result.offer=validateOffer(past.payload);result.sourceRevision=revision;}return result;
 });
}
export async function sellerDraftHistory(pool,{token,id}){
 if(!offerId(id))error('INVALID_REQUEST');return transaction(pool,token,false,async(db,company)=>{
  if(!(await db.query('SELECT 1 FROM shop_seller_offers WHERE company_id=$1 AND id=$2',[company,id])).rows.length)error('OFFER_NOT_FOUND');
  const rows=(await db.query('SELECT revision,action,state,created_at FROM shop_seller_offer_history WHERE company_id=$1 AND id=$2 ORDER BY revision DESC LIMIT 20',[company,id])).rows;
  return {id,versions:rows.map(row=>({revision:row.revision,action:row.action,state:row.state,createdAt:new Date(row.created_at).toISOString()})),limit:20,canPublish:false};
 });
}
export async function listSellerDrafts(pool,{token,query='',state='draft',category='Alle',kind='all',stock='all',cursor=null}){
 const filters=sellerListFilters({query,state,category,kind,stock});if(cursor!==null&&!offerId(cursor))error('INVALID_REQUEST');
 const selectedCategories=categories.filter(c=>c!=='Alle'&&categoryMatches(c,filters.category));
 const words=filters.query?filters.query.toLocaleLowerCase('de').split(' '):[];
 return transaction(pool,token,false,async(db,company)=>{
  const where=`company_id=$1 AND state=$2
   AND NOT EXISTS(SELECT 1 FROM unnest($3::text[]) word WHERE strpos(lower(coalesce(payload->>'title','')||' '||coalesce(payload->>'category','')||' '||coalesce(payload->>'sku','')||' '||coalesce(payload->>'gtin','')||' '||coalesce(payload->>'description','')||' '||coalesce(payload->>'delivery','')||' '||coalesce(payload->>'fulfilment','')),word)=0)
   AND (payload->>'category')=ANY($4::text[])
   AND ($5='all' OR payload->>'kind'=$5)
   AND ($6='all' OR payload->>'kind'='physical' AND (($6='empty' AND coalesce(payload->>'stock','')~'^0+$') OR ($6='available' AND coalesce(payload->>'stock','')~'^[0-9]{1,7}$' AND coalesce(payload->>'stock','')!~'^0+$')))`;
  const params=[company,filters.state,words,selectedCategories,filters.kind,filters.stock];
  const total=Number((await db.query('SELECT count(*) AS count FROM shop_seller_offers WHERE '+where,params)).rows[0].count);
  const rows=(await db.query('SELECT * FROM shop_seller_offers WHERE '+where+' AND ($7::text IS NULL OR id>$7) ORDER BY id LIMIT 26',[...params,cursor])).rows;
  return {offers:rows.slice(0,25).map(present),nextCursor:rows.length>25?rows[24].id:null,limit:25,total,filters,canPublish:false};
 });
}

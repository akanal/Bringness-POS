import crypto from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {downloadProduct} from './shop-download-policy.js';

const statuses=new Set(['all','prepared','uncertain','open','paid','failed','canceled']);
export async function migrateShopDownloadHistory(db){
 await db.query("CREATE INDEX IF NOT EXISTS shop_download_history ON shop_checkout_orders(company_id,created_at DESC,id DESC) WHERE snapshot->>'productId'='pos-download'");
}
function decode(value){
 if(value===null||value===undefined)return null;
 try{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(value))throw Error();const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw Error();
  const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!c||Object.keys(c).sort().join(',')!=='filter,id,scope,time,v'||c.v!==1||!statuses.has(c.filter)||!uuid(c.id)||typeof c.scope!=='string'||!/^[a-f0-9]{64}$/.test(c.scope)||typeof c.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(c.time)||!Number.isFinite(Date.parse(c.time))||new Date(c.time).toISOString().slice(0,19)!==c.time.slice(0,19))throw Error();return c;
 }catch{throw shopError('INVALID_REQUEST');}
}
export async function readShopDownloadHistory(pool,{token,cursor=null,status='all'}){
 if(!statuses.has(status))throw shopError('INVALID_REQUEST');const after=decode(cursor);if(after&&after.filter!==status)throw shopError('INVALID_REQUEST');
 const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash),scope=crypto.createHash('sha256').update('shop-download-history:'+actor.company_id).digest('hex');if(after&&after.scope!==scope)throw shopError('ACCOUNT_CHANGED');
  const rows=(await db.query(`SELECT id,status,snapshot,provider_mode,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM shop_checkout_orders WHERE company_id=$1 AND snapshot->>'productId'='pos-download' AND ($2='all' OR status=$2) ${after?'AND (created_at,id)<($3::timestamptz,$4::uuid)':''} ORDER BY created_at DESC,id DESC LIMIT 11`,after?[actor.company_id,status,after.time,after.id]:[actor.company_id,status])).rows;
  const visible=rows.slice(0,10),items=visible.map(row=>{
   if(!statuses.has(row.status)||row.status==='all'||!uuid(row.id)||!Number.isFinite(new Date(row.created_at).getTime())||!['test','live',null].includes(row.provider_mode))throw shopError('SHOP_UNAVAILABLE');
   return {id:row.id,status:row.status,createdAt:new Date(row.created_at).toISOString(),...downloadProduct(row.snapshot),paymentMode:row.provider_mode||'none',licence:'blocked',purchaseCompleted:false};
  }),last=visible.at(-1),nextCursor=rows.length>10?Buffer.from(JSON.stringify({v:1,filter:status,scope,time:last.cursor_time,id:last.id})).toString('base64url'):null;
  const checked=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;await db.query('COMMIT');return {version:1,scope,status,checkedAt:new Date(checked).toISOString(),items,nextCursor,canPay:false,canActivate:false,checkoutConnected:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

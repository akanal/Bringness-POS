import crypto from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
const pageSize=10;
export async function migrateShopDraftHistory(db){
 await db.query('CREATE INDEX IF NOT EXISTS shop_drafts_history ON shop_order_drafts(company_id,created_at DESC,id DESC)');
}
function decodeCursor(value){
 if(value===null||value===undefined)return null;
 try{
  if(typeof value!=='string'||value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))throw Error();
  const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw Error();
  const cursor=JSON.parse(bytes.toString('utf8'));
  if(!cursor||Object.keys(cursor).sort().join(',')!=='id,scope,time,v'||cursor.v!==1||typeof cursor.scope!=='string'||!/^[0-9a-f]{64}$/.test(cursor.scope)||!uuid(cursor.id)||typeof cursor.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.time)||!Number.isFinite(Date.parse(cursor.time))||new Date(cursor.time).toISOString().slice(0,19)!==cursor.time.slice(0,19))throw Error();
  return cursor;
 }catch{throw shopError('INVALID_REQUEST');}
}
function present(row){
 const lines=row.snapshot?.lines,l=lines?.[0],plan=l?.productId==='pos-online'?'pos_base_monthly':l?.productId==='pos-download'?'download_license':null;
 if(lines?.length!==1||!plan||l.planCode!==plan||l.quantity!==1||l.period!==(l.productId==='pos-online'?'monthly':'once')||row.snapshot.currency!=='EUR'||!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(l[k])&&l[k]>=0&&l[k]<=2147483647)||l.netCents<=0||l.netCents+l.vatCents!==l.grossCents||Math.round(l.netCents*19/100)!==l.vatCents)throw shopError('SHOP_UNAVAILABLE');
 return {id:row.id,status:row.status,expired:row.expired,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),productId:l.productId,planCode:l.planCode,period:l.period,currency:'EUR',netCents:l.netCents,vatCents:l.vatCents,grossCents:l.grossCents};
}
export async function readShopDraftHistory(pool,{token,cursor=null}){
 const after=decodeCursor(cursor),hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);const scope=crypto.createHash('sha256').update('shop-draft-history:'+actor.company_id).digest('hex');if(after&&after.scope!==scope)throw shopError('ACCOUNT_CHANGED');
  // Keep PostgreSQL microseconds in the cursor. JS Date would truncate them and
  // could skip rows sharing the same displayed millisecond across page boundaries.
  const rows=(await db.query(`SELECT *,expires_at<=clock_timestamp() AS expired,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM shop_order_drafts WHERE company_id=$1 ${after?'AND (created_at,id)<($2::timestamptz,$3::uuid)':''} ORDER BY created_at DESC,id DESC LIMIT 11`,after?[actor.company_id,after.time,after.id]:[actor.company_id])).rows;
  const visible=rows.slice(0,pageSize),items=visible.map(present),last=visible.at(-1);
  const nextCursor=rows.length>pageSize?Buffer.from(JSON.stringify({v:1,scope,time:last.cursor_time,id:last.id})).toString('base64url'):null;
  await db.query('COMMIT');return {version:1,scope,items,nextCursor,canPay:false,canActivate:false,checkoutConnected:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

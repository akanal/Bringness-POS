import crypto from 'node:crypto';
import {validateShopCart} from './shop-preview-policy.js';
import {shopActor,sessionHash,shopError,loadShopPreview,requireNoPendingBilling} from './shop-account.js';
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function migrateShopDrafts(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_order_drafts(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),request_id uuid NOT NULL,cart_hash text NOT NULL CHECK(length(cart_hash)=64),snapshot jsonb NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','canceled')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,UNIQUE(company_id,request_id),CHECK(expires_at>created_at))`);
 await db.query("CREATE UNIQUE INDEX IF NOT EXISTS shop_one_open_draft ON shop_order_drafts(company_id) WHERE status='draft'");
}
const present=row=>({version:1,id:row.id,requestId:row.request_id,status:row.status,snapshot:row.snapshot,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),expired:row.expired,canPay:false,canActivate:false,checkoutConnected:false});
const select="SELECT *,expires_at<=clock_timestamp() AS expired FROM shop_order_drafts";
export async function saveShopDraft(pool,{token,requestId,cart}){
 if(!uuid(requestId))throw shopError('INVALID_REQUEST');cart=validateShopCart(cart);
 if(Object.keys(cart).length!==1||Object.values(cart)[0]!==1)throw shopError('INVALID_CART');
 const hash=sessionHash(token),cartHash=crypto.createHash('sha256').update(JSON.stringify(cart)).digest('hex'),db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const initial=await shopActor(db,hash);
  await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[initial.company_id]);
  const actor=await shopActor(db,hash,true);if(actor.company_id!==initial.company_id)throw shopError('ACCOUNT_CHANGED');
  const old=(await db.query(`${select} WHERE company_id=$1 AND request_id=$2`,[actor.company_id,requestId])).rows[0];
  if(old){if(old.cart_hash!==cartHash)throw shopError('REQUEST_CONFLICT');await db.query('COMMIT');return {...present(old),replay:true};}
  if((await db.query("SELECT 1 FROM shop_order_drafts WHERE company_id=$1 AND status='draft'",[actor.company_id])).rows.length)throw shopError('DRAFT_PENDING');
  const snapshot=await loadShopPreview(db,actor.company_id,cart);
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
  if(snapshot.issues.length||new Date(snapshot.expiresAt)<=new Date(now))throw shopError('DRAFT_INELIGIBLE');
  const id=crypto.randomUUID();
  const row=(await db.query(`INSERT INTO shop_order_drafts(id,company_id,request_id,cart_hash,snapshot,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,false AS expired`,[id,actor.company_id,requestId,cartHash,JSON.stringify(snapshot),now,snapshot.expiresAt])).rows[0];
  await db.query('COMMIT');return {...present(row),replay:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function readShopDraft(pool,{token,id,requestId,active=false}){
 if([Boolean(id),Boolean(requestId),active===true].filter(Boolean).length!==1||(id&&!uuid(id))||(requestId&&!uuid(requestId)))throw shopError('INVALID_REQUEST');
 const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);
  const where=id?'id=$2':requestId?'request_id=$2':"status='draft'";
  const row=(await db.query(`${select} WHERE company_id=$1 AND ${where}`,active?[actor.company_id]:[actor.company_id,id||requestId])).rows[0];
  if(!row)throw shopError('DRAFT_NOT_FOUND');await db.query('COMMIT');return present(row);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function cancelShopDraft(pool,{token,id}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const first=await shopActor(db,hash);await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[first.company_id]);const actor=await shopActor(db,hash,true);if(actor.company_id!==first.company_id)throw shopError('ACCOUNT_CHANGED');
  const row=(await db.query(`${select} WHERE company_id=$1 AND id=$2 FOR UPDATE`,[actor.company_id,id])).rows[0];if(!row)throw shopError('DRAFT_NOT_FOUND');
  await requireNoPendingBilling(db,actor.company_id);
  const updated=(await db.query("UPDATE shop_order_drafts SET status='canceled' WHERE company_id=$1 AND id=$2 RETURNING *,expires_at<=clock_timestamp() AS expired",[actor.company_id,id])).rows[0];
  await db.query('COMMIT');return present(updated);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

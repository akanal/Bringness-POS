import {orderProduct} from './shop-order-product.js';
import {migrateShopTestPaymentQueue} from './shop-test-payment-queue.js';
import crypto from 'node:crypto';
import {uuid} from './shop-drafts.js';
import {shopActor,sessionHash,shopError,loadShopPreview} from './shop-account.js';
export async function migrateShopCheckouts(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_checkout_orders(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),draft_id uuid NOT NULL UNIQUE REFERENCES shop_order_drafts(id),request_id uuid NOT NULL,guard_id uuid NOT NULL UNIQUE REFERENCES billing_checkout_guards(id),status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','uncertain','open','paid','failed','canceled')),snapshot jsonb NOT NULL,provider_payment_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(company_id,request_id))`);
 for(const definition of ['session_hash text','billing_snapshot jsonb','checkout_url text','provider_customer_id text','dispatch_started_at timestamptz','provider_status text',"provider_mode text CHECK(provider_mode IN ('test','live'))"])await db.query('ALTER TABLE shop_checkout_orders ADD COLUMN IF NOT EXISTS '+definition);
 await migrateShopTestPaymentQueue(db);
}
function present(row){return {version:1,id:row.id,draftId:row.draft_id,requestId:row.request_id,status:row.status,snapshot:orderProduct(row.snapshot),canPay:false,canActivate:false,checkoutConnected:false};}
async function lockedActor(db,hash){const initial=await shopActor(db,hash);await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[initial.company_id]);const fresh=await shopActor(db,hash,true);if(fresh.company_id!==initial.company_id)throw shopError('ACCOUNT_CHANGED');return fresh;}
export async function prepareShopCheckout(pool,{token,draftId,requestId,acceptedNetCents,acceptedGrossCents}){
 if(!uuid(draftId)||!uuid(requestId)||![acceptedNetCents,acceptedGrossCents].every(n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647))throw shopError('INVALID_REQUEST');
 const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const actor=await lockedActor(db,hash);
  const previous=(await db.query('SELECT * FROM shop_checkout_orders WHERE company_id=$1 AND (request_id=$2 OR draft_id=$3)',[actor.company_id,requestId,draftId])).rows;
  if(previous.length){const old=previous[0];if(previous.length!==1||old.draft_id!==draftId||old.request_id!==requestId||old.snapshot.netCents!==acceptedNetCents||old.snapshot.grossCents!==acceptedGrossCents)throw shopError('REQUEST_CONFLICT');const result={...present(old),replay:true};await db.query('COMMIT');return result;}
  const draft=(await db.query('SELECT *,expires_at<=clock_timestamp() AS expired FROM shop_order_drafts WHERE company_id=$1 AND id=$2 FOR UPDATE',[actor.company_id,draftId])).rows[0];
  if(!draft)throw shopError('DRAFT_NOT_FOUND');if(draft.status!=='draft'||draft.expired)throw shopError('DRAFT_INELIGIBLE');
  const saved=draft.snapshot;if(saved?.currency!=='EUR'||saved.vatRate!==19||!Array.isArray(saved.lines)||saved.lines.length!==1||saved.lines[0]?.quantity!==1)throw shopError('DRAFT_INELIGIBLE');
  const old=orderProduct({...saved.lines[0],currency:saved.currency}),preview=await loadShopPreview(db,actor.company_id,{[old.productId]:1}),line=preview.lines[0];
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
  if(new Date(now)>=new Date(draft.expires_at)||preview.issues.length||!line||line.planCode!==old.planCode||line.period!==old.period||line.vatCents!==old.vatCents||line.netCents!==old.netCents||line.grossCents!==old.grossCents||line.netCents!==acceptedNetCents||line.grossCents!==acceptedGrossCents)throw shopError('PRICE_CHANGED');
  const plan=(await db.query('SELECT id FROM billing_plans WHERE code=$1 AND active=true',[line.planCode])).rows[0];if(!plan)throw shopError('DRAFT_INELIGIBLE');
  const id=crypto.randomUUID(),guardId=crypto.randomUUID(),snapshot={productId:line.productId,planCode:line.planCode,period:line.period,currency:'EUR',netCents:line.netCents,vatCents:line.vatCents,grossCents:line.grossCents};
  const billing=(await db.query('SELECT company_name,street,postal_code,city,country FROM company_billing_profiles WHERE company_id=$1',[actor.company_id])).rows[0];
  await db.query("INSERT INTO billing_checkout_guards(id,company_id,plan_id,slot,status) VALUES($1,$2,$3,'base','creating')",[guardId,actor.company_id,plan.id]);
  const row=(await db.query("INSERT INTO shop_checkout_orders(id,company_id,draft_id,request_id,guard_id,snapshot,session_hash,billing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[id,actor.company_id,draftId,requestId,guardId,JSON.stringify(snapshot),hash,JSON.stringify(billing)])).rows[0];
  await db.query('COMMIT');return {...present(row),replay:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function readShopCheckout(pool,{token,id,draftId}){
 if(Boolean(id)===Boolean(draftId)||(id&&!uuid(id))||(draftId&&!uuid(draftId)))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);const row=(await db.query(`SELECT * FROM shop_checkout_orders WHERE company_id=$1 AND ${id?'id':'draft_id'}=$2`,[actor.company_id,id||draftId])).rows[0];if(!row)throw shopError('CHECKOUT_NOT_FOUND');const result=present(row);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function abandonShopCheckout(pool,{token,id}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const actor=await lockedActor(db,hash);const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE company_id=$1 AND id=$2 FOR UPDATE',[actor.company_id,id])).rows[0];if(!order)throw shopError('CHECKOUT_NOT_FOUND');
  if(order.status==='canceled'){const result=present(order);await db.query('COMMIT');return result;}
  if(order.status!=='prepared'||order.provider_payment_id||order.dispatch_started_at)throw shopError('CHECKOUT_PENDING');
  const guard=(await db.query('SELECT * FROM billing_checkout_guards WHERE company_id=$1 AND id=$2 FOR UPDATE',[actor.company_id,order.guard_id])).rows[0];
  if(!guard||guard.status!=='creating'||guard.provider_payment_id)throw shopError('CHECKOUT_PENDING');
  await db.query("UPDATE billing_checkout_guards SET status='resolved' WHERE company_id=$1 AND id=$2",[actor.company_id,guard.id]);
  await db.query("UPDATE shop_order_drafts SET status='canceled' WHERE company_id=$1 AND id=$2",[actor.company_id,order.draft_id]);
  const row=(await db.query("UPDATE shop_checkout_orders SET status='canceled' WHERE company_id=$1 AND id=$2 RETURNING *",[actor.company_id,id])).rows[0];const result=present(row);await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

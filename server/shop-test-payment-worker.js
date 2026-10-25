import crypto from 'node:crypto';
import {reconcileShopTestPayment} from './shop-payment-status.js';
const unsafe=new Set(['PROVIDER_MISMATCH','PAYMENT_REGRESSION','CHECKOUT_PENDING','CHECKOUT_NOT_FOUND']);
// Explicit internal tick only; no startup timer or public execution route.
export async function processShopTestPayment(pool,{fetchPayment}){
 if(typeof fetchPayment!=='function')throw Error('INVALID_REQUEST');
 const db=await pool.connect();let claimed;try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
  const row=(await db.query(`SELECT * FROM shop_test_payment_queue WHERE (state='pending' AND next_at<=clock_timestamp()) OR (state='working' AND lease_until<=clock_timestamp()) ORDER BY next_at,checkout_id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
  if(row){
   if(row.attempts>=8)await db.query("UPDATE shop_test_payment_queue SET state='review',last_error='RETRY_LIMIT',lease_token=NULL,lease_until=NULL WHERE checkout_id=$1",[row.checkout_id]);
   else claimed=(await db.query("UPDATE shop_test_payment_queue SET state='working',attempts=attempts+1,claimed_version=version,lease_token=$2,lease_until=clock_timestamp()+interval '1 minute' WHERE checkout_id=$1 RETURNING *",[row.checkout_id,crypto.randomUUID()])).rows[0];
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 if(!claimed)return {processed:false};
 let failure;try{const binding=(await pool.query('SELECT provider_payment_id,provider_mode FROM shop_checkout_orders WHERE id=$1',[claimed.checkout_id])).rows[0];if(!binding||binding.provider_mode!=='test'||binding.provider_payment_id!==claimed.provider_payment_id){const e=Error('PROVIDER_MISMATCH');e.code='PROVIDER_MISMATCH';throw e;}await reconcileShopTestPayment(pool,{id:claimed.checkout_id,fetchPayment:id=>{if(id!==claimed.provider_payment_id)throw Error('PROVIDER_MISMATCH');return fetchPayment(id);}});}catch(e){failure=unsafe.has(e.code)?'PAYMENT_REVIEW':'RETRY_UNAVAILABLE';}
 const review=failure==='PAYMENT_REVIEW'||claimed.attempts>=8;
 const state=failure?(review?'review':'pending'):'done';
 // A callback received while processing must not be lost when this lease finishes.
 const updated=await pool.query(`UPDATE shop_test_payment_queue SET
  state=CASE WHEN $3='done' AND version>claimed_version THEN 'pending' ELSE $3 END,
  next_at=CASE WHEN $3='pending' THEN clock_timestamp()+($5::int*interval '1 second') ELSE clock_timestamp() END,
  attempts=CASE WHEN $3='done' THEN 0 ELSE attempts END,lease_token=NULL,lease_until=NULL,last_error=$4
  WHERE checkout_id=$1 AND lease_token=$2 AND state='working' RETURNING state`,[claimed.checkout_id,claimed.lease_token,state,failure,Math.min(3600,30*2**(claimed.attempts-1))]);
 return {processed:true,state:updated.rows[0]?.state||'superseded',canPay:false,canActivate:false};
}

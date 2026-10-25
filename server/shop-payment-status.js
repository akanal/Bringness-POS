import {lockShopPaymentGuard} from './shop-payment-guard.js';
import {uuid} from './shop-drafts.js';
import {shopError} from './shop-account.js';
import {lockShopOrder} from './shop-checkout-dispatch.js';
import {matchesShopPayment} from './shop-provider-proof.js';
export async function migrateShopPaymentStatus(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_license_jobs(checkout_id uuid PRIMARY KEY REFERENCES shop_checkout_orders(id),company_id uuid NOT NULL REFERENCES companies(id),plan_code text NOT NULL,provider_payment_id text NOT NULL UNIQUE,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
}
const result=row=>({id:row.id,status:row.status,licence:row.status==='paid'?'pending':'none',canPay:false,canActivate:false,checkoutConnected:false});
// Internal TEST reconciliation only. Never accept a browser redirect/webhook body
// as proof, activate a licence here, or release a paid guard before fulfilment.
export async function reconcileShopTestPayment(pool,{id,fetchPayment}){
 if(!uuid(id)||typeof fetchPayment!=='function')throw shopError('INVALID_REQUEST');
 const ref=(await pool.query('SELECT provider_payment_id FROM shop_checkout_orders WHERE id=$1',[id])).rows[0];
 if(!ref?.provider_payment_id)throw shopError('CHECKOUT_NOT_FOUND');
 let payment;try{payment=await fetchPayment(ref.provider_payment_id);}catch{throw shopError('PROVIDER_UNCERTAIN');}
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const order=await lockShopOrder(db,id);
  if(!matchesShopPayment(order,payment))throw shopError('PROVIDER_MISMATCH');
  if(order.status==='paid'){
   const job=(await db.query('SELECT * FROM shop_license_jobs WHERE checkout_id=$1',[id])).rows[0];
   if(payment.status!=='paid'||!job||job.company_id!==order.company_id||job.plan_code!==order.snapshot.planCode||job.provider_payment_id!==order.provider_payment_id)throw shopError('PAYMENT_REGRESSION');
   await db.query('COMMIT');return result(order);
  }
  if(['failed','canceled'].includes(order.status)){
   if(order.provider_status!==payment.status)throw shopError('PAYMENT_REGRESSION');await db.query('COMMIT');return result(order);
  }
  if(order.status!=='open')throw shopError('CHECKOUT_PENDING');
  const guard=await lockShopPaymentGuard(db,order,{state:'open',paymentId:order.provider_payment_id});
  let status='open';
  if(payment.status==='paid'){
   await db.query('INSERT INTO shop_license_jobs(checkout_id,company_id,plan_code,provider_payment_id) VALUES($1,$2,$3,$4)',[id,order.company_id,order.snapshot.planCode,order.provider_payment_id]);status='paid';
  }else if(['failed','expired','canceled'].includes(payment.status)){
   status=payment.status==='canceled'?'canceled':'failed';
   await db.query("UPDATE billing_checkout_guards SET status='resolved' WHERE id=$1 AND company_id=$2",[guard.id,order.company_id]);
   await db.query("UPDATE shop_order_drafts SET status='canceled' WHERE id=$1 AND company_id=$2",[order.draft_id,order.company_id]);
  }
  const updated=(await db.query('UPDATE shop_checkout_orders SET status=$2,provider_status=$3 WHERE id=$1 RETURNING *',[id,status,payment.status])).rows[0];
  await db.query('COMMIT');return result(updated);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

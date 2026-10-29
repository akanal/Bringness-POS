import {applyShopPaymentEvent} from './shop-payment-ledger.js';
import {assertShopPaymentAmount} from './shop-payment-state.js';
// Standalone persistence primitive; intentionally not wired into HTTP/provider handlers.
// Caller must verify provider authenticity and order ownership before invoking.
export async function migrateShopPaymentLedger(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_payment_ledger(
 order_id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 provider_reference text UNIQUE,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 currency text NOT NULL CHECK(currency='EUR'),
 snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
 )`);
}
export async function initializeShopPaymentLedger(pool,{orderId,companyId,amountCents,currency}){
 assertShopPaymentAmount({amountCents,currency,orderId});
 const initial={amountCents,events:[],status:'unpaid'};
 await pool.query('INSERT INTO shop_payment_ledger(order_id,company_id,amount_cents,currency,snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING',[orderId,companyId,amountCents,currency,initial]);
 const row=(await pool.query('SELECT company_id,amount_cents,currency,snapshot FROM shop_payment_ledger WHERE order_id=$1',[orderId])).rows[0];
 if(!row||row.company_id!==companyId||Number(row.amount_cents)!==amountCents||row.currency!==currency)throw Error('PAYMENT_LEDGER_CONFLICT');
 return row.snapshot;
}
export async function bindShopPaymentProvider(pool,{orderId,companyId,providerReference}){
 if(typeof providerReference!=='string'||!/^[A-Za-z0-9_-]{3,160}$/.test(providerReference))throw Error('PAYMENT_PROVIDER_REFERENCE_INVALID');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const row=(await db.query('SELECT provider_reference,snapshot FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2 FOR UPDATE',[orderId,companyId])).rows[0];
  if(!row)throw Error('PAYMENT_ORDER_NOT_FOUND');
  if(row.snapshot.status!=='unpaid'&&row.provider_reference!==providerReference)throw Error('PAYMENT_PROVIDER_BINDING_CLOSED');
  if(row.provider_reference&&row.provider_reference!==providerReference)throw Error('PAYMENT_PROVIDER_REFERENCE_CONFLICT');
  if(!row.provider_reference)await db.query('UPDATE shop_payment_ledger SET provider_reference=$3 WHERE order_id=$1 AND company_id=$2',[orderId,companyId,providerReference]);
  await db.query('COMMIT');return {orderId,providerReference};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function recordShopPaymentEvent(pool,{orderId,companyId,event}){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const row=(await db.query('SELECT snapshot,provider_reference FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2 FOR UPDATE',[orderId,companyId])).rows[0];
  if(!row)throw Error('PAYMENT_ORDER_NOT_FOUND');
  if(!row.provider_reference||row.provider_reference!==event?.providerReference)throw Error('PAYMENT_PROVIDER_REFERENCE_MISMATCH');
  // Provider verification must occur upstream; this module is not an authenticated webhook handler.
  const result=applyShopPaymentEvent(row.snapshot,event);
  if(!result.replay)await db.query('UPDATE shop_payment_ledger SET snapshot=$3,updated_at=now() WHERE order_id=$1 AND company_id=$2',[orderId,companyId,result.snapshot]);
  await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

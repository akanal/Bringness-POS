import {applyShopPaymentEvent} from './shop-payment-ledger.js';
// Standalone persistence primitive; intentionally not wired into HTTP/provider handlers.
// Caller must verify provider authenticity and order ownership before invoking.
export async function migrateShopPaymentLedger(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shop_payment_ledger(
 order_id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 currency text NOT NULL CHECK(currency='EUR'),
 snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
 )`);
}
export async function initializeShopPaymentLedger(pool,{orderId,companyId,amountCents,currency}){
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||currency!=='EUR')throw Error('PAYMENT_AMOUNT_INVALID');
 const initial={amountCents,events:[],status:'unpaid'};
 await pool.query('INSERT INTO shop_payment_ledger(order_id,company_id,amount_cents,currency,snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING',[orderId,companyId,amountCents,currency,initial]);
 const row=(await pool.query('SELECT company_id,amount_cents,currency FROM shop_payment_ledger WHERE order_id=$1',[orderId])).rows[0];
 if(!row||row.company_id!==companyId||Number(row.amount_cents)!==amountCents||row.currency!==currency)throw Error('PAYMENT_LEDGER_CONFLICT');
 return initial;
}
export async function recordShopPaymentEvent(pool,{orderId,companyId,event}){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const row=(await db.query('SELECT snapshot FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2 FOR UPDATE',[orderId,companyId])).rows[0];
  if(!row)throw Error('PAYMENT_ORDER_NOT_FOUND');
  const result=applyShopPaymentEvent(row.snapshot,event);
  if(!result.replay)await db.query('UPDATE shop_payment_ledger SET snapshot=$3,updated_at=now() WHERE order_id=$1 AND company_id=$2',[orderId,companyId,result.snapshot]);
  await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

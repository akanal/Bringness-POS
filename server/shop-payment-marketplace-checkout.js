import {randomUUID} from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {verifyShopProviderPayment} from './shop-payment-provider-check.js';
import {safeCheckoutUrl,paymentId} from './shop-provider-proof.js';

// Marketplace test checkout only. A trusted per-seller resolver is mandatory;
// never reuse the platform's POS subscription credentials as a seller account.
const fail=code=>{throw shopError(code);};
export async function migrateMarketplaceCheckout(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_test_checkouts(
 order_id uuid PRIMARY KEY REFERENCES shop_market_seller_orders(id),
 buyer_company_id uuid NOT NULL REFERENCES companies(id),
 seller_company_id uuid NOT NULL REFERENCES companies(id),
 intent_id uuid NOT NULL UNIQUE,
 merchant_id text NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 currency text NOT NULL CHECK(currency='EUR'),
 state text NOT NULL CHECK(state IN ('prepared','uncertain','open','pending','authorized','paid','failed','expired','canceled')),
 provider_id text UNIQUE,checkout_url text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
 )`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_test_checkout_requests(
 buyer_company_id uuid NOT NULL REFERENCES companies(id),request_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES shop_market_test_checkouts(order_id),
 PRIMARY KEY(buyer_company_id,request_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_test_checkout_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES shop_market_test_checkouts(order_id),state text NOT NULL,
 provider_id text,created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 await db.query(`CREATE OR REPLACE FUNCTION shop_market_checkout_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'immutable test checkout event'; END $$`);
 await db.query('DROP TRIGGER IF EXISTS shop_market_checkout_audit_immutable ON shop_market_test_checkout_events');
 await db.query('CREATE TRIGGER shop_market_checkout_audit_immutable BEFORE UPDATE OR DELETE ON shop_market_test_checkout_events FOR EACH ROW EXECUTE FUNCTION shop_market_checkout_audit_immutable()');
}
async function audit(db,row){await db.query('INSERT INTO shop_market_test_checkout_events(order_id,state,provider_id) VALUES($1,$2,$3)',[row.order_id,row.state,row.provider_id||null]);}

const publicResult=row=>({orderId:row.order_id,paymentMode:'test',paymentStatus:row.state,
 amountCents:Number(row.amount_cents),currency:row.currency,
 checkoutUrl:['open','pending','authorized'].includes(row.state)?row.checkout_url:null,
 canPay:false,canFulfil:false,requiresRecovery:row.state==='uncertain'});

export function createMarketplaceCheckout(pool,{resolveProvider,providerTimeoutMs=10000}={}){
 if(!Number.isSafeInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>30000)throw Error('INVALID_MARKET_PROVIDER_TIMEOUT');
 async function bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('MARKET_PAYMENT_UNCERTAIN')),providerTimeoutMs);})]);}finally{clearTimeout(timer);}}

 const enabled=typeof resolveProvider==='function';
 async function transaction(token,orderId,fn){
  if(!enabled)fail('MARKET_CHECKOUT_DISABLED');
  if(!uuid(orderId))fail('INVALID_MARKET_INPUT');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
   const hash=sessionHash(token),first=await shopActor(db,hash);
   await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[first.company_id]);
   const actor=await shopActor(db,hash,true);
   if(actor.company_id!==first.company_id)fail('ACCOUNT_CHANGED');
   // Same lock used by fulfilment/cancellation, across all buyers and devices.
   const order=(await db.query(`SELECT o.* FROM shop_market_seller_orders o
    JOIN shop_market_orders b ON b.order_id=o.id WHERE o.id=$1 AND b.buyer_company_id=$2 FOR UPDATE OF o`,[orderId,actor.company_id])).rows[0];
   if(!order)fail('ORDER_NOT_FOUND');
   const value=await fn(db,actor.company_id,order);
   await db.query('COMMIT');return value;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function providerFor(seller){
  const p=await bounded(()=>resolveProvider(seller));
  if(!p||p.mode!=='test'||typeof p.merchantId!=='string'||!p.merchantId.trim()||p.merchantId.length>160||
   p.sellerCompanyId!==seller||typeof p.createPayment!=='function'||typeof p.fetchPayment!=='function'||typeof p.recoverPayment!=='function')fail('MARKET_MERCHANT_NOT_CONNECTED');
  return p;
 }
 function command(row){return Object.freeze({orderId:row.order_id,sellerCompanyId:row.seller_company_id,
  merchantId:row.merchant_id,amountCents:Number(row.amount_cents),currency:'EUR',mode:'test',
  idempotencyKey:'market-test:'+row.intent_id});}
 function proof(row,payment){
  if(!payment||payment.mode!=='test'||payment.merchantId!==row.merchant_id||payment.orderId!==row.order_id||
   payment.amountCents!==Number(row.amount_cents)||payment.currency!==row.currency||!paymentId(payment.id)||
   !['open','pending','authorized','paid','failed','expired','canceled'].includes(payment.status)||
   (row.provider_id&&row.provider_id!==payment.id))fail('MARKET_PAYMENT_MISMATCH');
  if(payment.status==='paid')verifyShopProviderPayment({orderId:row.order_id,providerReference:payment.id,amountCents:Number(row.amount_cents),currency:row.currency},payment);
  if(['open','pending','authorized'].includes(payment.status)&&(typeof payment.checkoutUrl!=='string'||payment.checkoutUrl.length>2048||!safeCheckoutUrl(payment.checkoutUrl)))fail('MARKET_PAYMENT_MISMATCH');
 }
 async function attach(token,orderId,payment){
  return transaction(token,orderId,async(db,buyer)=>{
   const row=(await db.query('SELECT * FROM shop_market_test_checkouts WHERE order_id=$1 AND buyer_company_id=$2 FOR UPDATE',[orderId,buyer])).rows[0];
   if(!row)fail('ORDER_NOT_FOUND');proof(row,payment);
   // A late open/failed reply cannot overwrite a confirmed payment.
   if(row.state==='paid'){if(payment.status!=='paid')return publicResult(row);}
   else if(['failed','expired','canceled'].includes(row.state)&&payment.status!==row.state)fail('MARKET_PAYMENT_STATE_CONFLICT');
   if(row.state===payment.status&&row.provider_id===payment.id)return publicResult(row);
   const saved=(await db.query(`UPDATE shop_market_test_checkouts SET state=$2,provider_id=$3,checkout_url=$4,
    updated_at=clock_timestamp() WHERE order_id=$1 RETURNING *`,[orderId,payment.status,payment.id,
     ['open','pending','authorized'].includes(payment.status)?payment.checkoutUrl:null])).rows[0];
   await audit(db,saved);return publicResult(saved);
  });
 }
 async function prepare({token,orderId,requestId}){
  if(!uuid(requestId))fail('INVALID_MARKET_INPUT');
  return transaction(token,orderId,async(db,buyer,order)=>{
   // Serialize request IDs across different orders belonging to the same buyer.
   const request=(await db.query('SELECT order_id FROM shop_market_test_checkout_requests WHERE buyer_company_id=$1 AND request_id=$2',[buyer,requestId])).rows[0];
   if(request&&request.order_id!==orderId)fail('REQUEST_CONFLICT');
   let row=(await db.query('SELECT * FROM shop_market_test_checkouts WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!row){
    const state=(await db.query('SELECT status FROM shop_market_order_state WHERE order_id=$1',[orderId])).rows[0]?.status||'received';
    if(!['received','accepted'].includes(state))fail('MARKET_ORDER_NOT_PAYABLE');
    const approved=(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[order.company_id])).rows.length;
    if(!approved)fail('SELLER_NOT_APPROVED');
    const amount=order.snapshot?.grossCents;
    if(!Number.isSafeInteger(amount)||amount<=0||order.snapshot.currency!=='EUR')fail('MARKET_ORDER_AMOUNT_INVALID');
    if(order.company_id===buyer)fail('MARKET_SELF_PAYMENT_FORBIDDEN');
    const provider=await providerFor(order.company_id);
    row=(await db.query(`INSERT INTO shop_market_test_checkouts(order_id,buyer_company_id,seller_company_id,intent_id,merchant_id,amount_cents,currency,state)
     VALUES($1,$2,$3,$4,$5,$6,'EUR','prepared') RETURNING *`,[orderId,buyer,order.company_id,randomUUID(),provider.merchantId,amount])).rows[0];
    await audit(db,row);
   }
   if(!request){
    const count=(await db.query('SELECT count(*)::int AS n FROM shop_market_test_checkout_requests WHERE order_id=$1',[orderId])).rows[0].n;
    if(count>=32)fail('MARKET_CHECKOUT_REQUEST_LIMIT');
    await db.query('INSERT INTO shop_market_test_checkout_requests VALUES($1,$2,$3)',[buyer,requestId,orderId]);
   }
   return row;
  });
 }
 async function start(args){
  await prepare(args);
  const claimed=await transaction(args.token,args.orderId,async(db,buyer,order)=>{
   const row=(await db.query('SELECT * FROM shop_market_test_checkouts WHERE order_id=$1 AND buyer_company_id=$2 FOR UPDATE',[args.orderId,buyer])).rows[0];
   if(row.state!=='prepared')return {row,dispatch:false};
   const seller=(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[order.company_id])).rows.length;
   const state=(await db.query('SELECT status FROM shop_market_order_state WHERE order_id=$1',[order.id])).rows[0]?.status||'received';
   if(!seller||!['received','accepted'].includes(state))fail('MARKET_ORDER_NOT_PAYABLE');
   const provider=await providerFor(row.seller_company_id);
   if(provider.merchantId!==row.merchant_id)fail('MARKET_MERCHANT_CHANGED');
   const saved=(await db.query("UPDATE shop_market_test_checkouts SET state='uncertain',updated_at=clock_timestamp() WHERE order_id=$1 RETURNING *",[row.order_id])).rows[0];
   await audit(db,saved);return {row:saved,dispatch:true,provider};
  });
  if(!claimed.dispatch)return publicResult(claimed.row);
  // Commit uncertainty before provider I/O. Never submit twice on a retry.
  let payment;try{payment=await bounded(()=>claimed.provider.createPayment(command(claimed.row)));}catch{fail('MARKET_PAYMENT_UNCERTAIN');}
  return attach(args.token,args.orderId,payment);
 }
 async function readRow({token,orderId}){return transaction(token,orderId,async(db,buyer)=>{
  const row=(await db.query('SELECT * FROM shop_market_test_checkouts WHERE order_id=$1 AND buyer_company_id=$2',[orderId,buyer])).rows[0];
  if(!row)fail('ORDER_NOT_FOUND');return row;
 });}
 async function refresh(args){
  const row=await readRow(args),provider=await providerFor(row.seller_company_id);
  if(provider.merchantId!==row.merchant_id)fail('MARKET_MERCHANT_CHANGED');
  if(row.state==='prepared')return publicResult(row);
  let payment;try{
   // Recovery is lookup-only by the original immutable key, not another create.
   payment=await bounded(()=>row.provider_id?provider.fetchPayment(row.provider_id):provider.recoverPayment(command(row)));
  }catch{fail('MARKET_PAYMENT_UNCERTAIN');}
  if(!payment)fail('MARKET_PAYMENT_UNCERTAIN');
  return attach(args.token,args.orderId,payment);
 }
 return {enabled,start,refresh,async status(args){return publicResult(await readRow(args));}};
}

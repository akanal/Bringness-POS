import {digestShopDocument} from './shop-document-archive-policy.js';
import {uuid} from './shop-drafts.js';

// Internal live settlement boundary. Not mounted in HTTP/startup. Provider facts,
// acceptance and fiscal proof must come from trusted server integrations, not UI.
const fail=code=>{throw Error(code);};
const cents=n=>Number.isSafeInteger(n)&&n>=0;
export const marketplaceSettlementDigest=value=>digestShopDocument(value).digest;
const digest=marketplaceSettlementDigest;
export async function migrateMarketplaceSettlement(pool){
 const db=await pool.connect();
 try{
 await db.query('BEGIN');
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_live_settlements(
 order_id uuid PRIMARY KEY REFERENCES shop_market_seller_orders(id),seller_company_id uuid NOT NULL REFERENCES companies(id),
 provider_id text NOT NULL UNIQUE,merchant_id text NOT NULL,profile_id text NOT NULL,connection_id uuid NOT NULL,
 gross_cents bigint NOT NULL CHECK(gross_cents>0),net_cents bigint NOT NULL CHECK(net_cents>=0),vat_cents bigint NOT NULL CHECK(vat_cents>=0),
 fee_cents bigint CHECK(fee_cents>=0),currency text NOT NULL CHECK(currency='EUR'),
 order_digest text NOT NULL,acceptance_reference text NOT NULL,fiscal_reference text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_live_refunds(
 refund_id text PRIMARY KEY,order_id uuid NOT NULL REFERENCES shop_market_live_settlements(order_id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_live_handoffs(
 order_id uuid PRIMARY KEY REFERENCES shop_market_live_settlements(order_id),
 seller_company_id uuid NOT NULL REFERENCES companies(id),
 state text NOT NULL CHECK(state IN ('ready','blocked','consumed')),receipt_id uuid UNIQUE,
 CHECK((state='consumed')=(receipt_id IS NOT NULL)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 await db.query(`CREATE OR REPLACE FUNCTION shop_market_live_accounting_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'immutable marketplace accounting'; END $$`);
 await db.query(`CREATE OR REPLACE FUNCTION shop_market_live_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF EXISTS(SELECT 1 FROM shop_market_live_settlements WHERE order_id=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END) THEN RAISE EXCEPTION 'LIVE_ORDER_TRANSITION_REQUIRES_INTEGRATION'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$`);
 await db.query('DROP TRIGGER IF EXISTS shop_market_live_order_guard ON shop_market_order_state');
 await db.query('CREATE TRIGGER shop_market_live_order_guard BEFORE INSERT OR UPDATE OR DELETE ON shop_market_order_state FOR EACH ROW EXECUTE FUNCTION shop_market_live_order_guard()');
 for(const table of ['shop_market_live_settlements','shop_market_live_refunds']){
  await db.query(`DROP TRIGGER IF EXISTS shop_market_live_immutable ON ${table}`);
  await db.query(`CREATE TRIGGER shop_market_live_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION shop_market_live_accounting_immutable()`);
 }
 await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
function binding(value,seller){
 if(!value||value.mode!=='live'||value.status!=='verified'||value.sellerCompanyId!==seller||!uuid(value.connectionId)||!/^org_[A-Za-z0-9]{1,100}$/.test(value.merchantId||'')||!/^pfl_[A-Za-z0-9]{1,100}$/.test(value.profileId||''))fail('LIVE_MERCHANT_NOT_VERIFIED');
 return {sellerCompanyId:seller,connectionId:value.connectionId,merchantId:value.merchantId,profileId:value.profileId};
}
function accepted(a,b,orderId){
 if(!a||a.mode!=='live'||a.sellerCompanyId!==b.sellerCompanyId||a.connectionId!==b.connectionId||a.merchantId!==b.merchantId||a.profileId!==b.profileId||a.orderId!==orderId||!/^[a-f0-9]{64}$/.test(a.orderDigest||'')||a.merchantAccepted!==true||a.accountingAccepted!==true||a.fiscalAccepted!==true||a.fulfilmentAccepted!==true||typeof a.reference!=='string'||!a.reference||a.reference.length>160||typeof a.fiscalReference!=='string'||!a.fiscalReference||a.fiscalReference.length>160)fail('LIVE_ACCEPTANCE_REQUIRED');
 return {reference:a.reference,fiscalReference:a.fiscalReference,orderDigest:a.orderDigest};
}
function orderAmounts(snapshot){
 if(!snapshot||snapshot.currency!=='EUR'||!cents(snapshot.netCents)||!cents(snapshot.vatCents)||!cents(snapshot.grossCents)||snapshot.grossCents<=0||snapshot.netCents+snapshot.vatCents!==snapshot.grossCents)fail('LIVE_ORDER_AMOUNT_INVALID');
 if(!Array.isArray(snapshot.lines)||snapshot.lines.length<1||snapshot.lines.length>21)fail('LIVE_ORDER_AMOUNT_INVALID');
 let net=0,vat=0;for(const l of snapshot.lines){if(!l||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>999||!cents(l.unitNetCents)||l.unitNetCents>100000000||![0,700,1900].includes(l.vatBasisPoints))fail('LIVE_ORDER_AMOUNT_INVALID');const n=l.quantity*l.unitNetCents;net+=n;vat+=Math.round(n*l.vatBasisPoints/10000);if(!cents(n)||!cents(net)||!cents(vat))fail('LIVE_ORDER_AMOUNT_INVALID');}
 if(net!==snapshot.netCents||vat!==snapshot.vatCents)fail('LIVE_ORDER_AMOUNT_INVALID');
 return {grossCents:snapshot.grossCents,netCents:snapshot.netCents,vatCents:snapshot.vatCents};
}
export function createMarketplaceSettlement(pool,{loadBinding,loadAcceptance,fetchPayment,fetchRefund,providerTimeoutMs=15000}={}){
 if(!Number.isSafeInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>30000)fail('LIVE_PROVIDER_TIMEOUT_INVALID');
 async function providerFacts(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),providerTimeoutMs);})]);}catch{fail('LIVE_PROVIDER_UNAVAILABLE');}finally{clearTimeout(timer);}}
 const enabled=[loadBinding,loadAcceptance,fetchPayment,fetchRefund].every(f=>typeof f==='function');
 function requireEnabled(){if(!enabled)fail('LIVE_SETTLEMENT_DISABLED');}
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async function evidence(seller,orderId,providerId){
  const b=binding(await loadBinding(seller),seller);
  const a=accepted(await loadAcceptance(seller,orderId),b,orderId);
  const p=Object.freeze({...await providerFacts(()=>fetchPayment(Object.freeze({...b,orderId,providerId})))});
  return {b,a,p};
 }
 function proof(p,b,orderId,providerId,amount){
  if(!p||p.mode!=='live'||p.status!=='paid'||p.id!==providerId||!/^tr_[A-Za-z0-9]{1,100}$/.test(providerId)||p.orderId!==orderId||p.sellerCompanyId!==b.sellerCompanyId||p.merchantId!==b.merchantId||p.profileId!==b.profileId||p.currency!=='EUR'||p.amountCents!==amount||!cents(p.amountRefundedCents)||p.amountRefundedCents>amount||!cents(p.amountChargedBackCents)||p.amountChargedBackCents!==0||p.feeCents!==null&&!cents(p.feeCents))fail('LIVE_PAYMENT_MISMATCH');
 }
 return {enabled,
  async settle({sellerCompanyId:seller,orderId,providerId}){
   requireEnabled();if(!uuid(seller)||!uuid(orderId)||!/^tr_[A-Za-z0-9]{1,100}$/.test(providerId||''))fail('LIVE_SETTLEMENT_INPUT');
   const e=await evidence(seller,orderId,providerId);
   return tx(async db=>{
    // Lock the same original order as cancellation/fulfilment; never use UI totals.
    const order=(await db.query('SELECT * FROM shop_market_seller_orders WHERE id=$1 AND company_id=$2 FOR UPDATE',[orderId,seller])).rows[0];if(!order)fail('LIVE_ORDER_NOT_FOUND');
    const active=(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[seller])).rows[0];if(!active)fail('LIVE_MERCHANT_NOT_VERIFIED');
    const current=binding(await loadBinding(seller,db),seller);if(JSON.stringify(current)!==JSON.stringify(e.b))fail('LIVE_MERCHANT_CHANGED');
    const acceptance=accepted(await loadAcceptance(seller,orderId,db),current,orderId);if(JSON.stringify(acceptance)!==JSON.stringify(e.a))fail('LIVE_ACCEPTANCE_CHANGED');
    if(acceptance.orderDigest!==digest(order.snapshot))fail('LIVE_ACCEPTANCE_CHANGED');
    const amounts=orderAmounts(order.snapshot);proof(e.p,current,orderId,providerId,amounts.grossCents);
    const previous=(await db.query('SELECT * FROM shop_market_live_settlements WHERE order_id=$1',[orderId])).rows[0];
    if(previous){if(previous.seller_company_id!==seller||previous.provider_id!==providerId||previous.connection_id!==current.connectionId||previous.merchant_id!==current.merchantId||previous.profile_id!==current.profileId||previous.order_digest!==digest(order.snapshot)||previous.acceptance_reference!==acceptance.reference||previous.fiscal_reference!==acceptance.fiscalReference||Number(previous.gross_cents)!==amounts.grossCents)fail('LIVE_SETTLEMENT_CONFLICT');return {orderId,paymentMode:'live',accountingStatus:'recorded',replay:true,canFulfil:false};}
    if(e.p.amountRefundedCents!==0)fail('LIVE_REFUND_RECONCILIATION_REQUIRED');
    if((await db.query('SELECT 1 FROM shop_market_test_checkouts WHERE order_id=$1',[orderId])).rows.length)fail('LIVE_TEST_ORDER_FORBIDDEN');
    const state=(await db.query('SELECT status FROM shop_market_order_state WHERE order_id=$1',[orderId])).rows[0]?.status||'received';if(!['received','accepted'].includes(state))fail('LIVE_ORDER_NOT_PAYABLE');
    await db.query(`INSERT INTO shop_market_live_settlements(order_id,seller_company_id,provider_id,merchant_id,profile_id,connection_id,gross_cents,net_cents,vat_cents,fee_cents,currency,order_digest,acceptance_reference,fiscal_reference)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EUR',$11,$12,$13)`,[orderId,seller,providerId,current.merchantId,current.profileId,current.connectionId,amounts.grossCents,amounts.netCents,amounts.vatCents,e.p.feeCents,digest(order.snapshot),acceptance.reference,acceptance.fiscalReference]);
    await db.query("INSERT INTO shop_market_live_handoffs(order_id,seller_company_id,state) VALUES($1,$2,'ready')",[orderId,seller]);
    return {orderId,paymentMode:'live',accountingStatus:'recorded',replay:false,canFulfil:false};
   });
  },
  async refund({sellerCompanyId:seller,orderId,refundId}){
   requireEnabled();if(!uuid(seller)||!uuid(orderId)||!/^re_[A-Za-z0-9]{1,100}$/.test(refundId||''))fail('LIVE_SETTLEMENT_INPUT');
   const saved=(await pool.query('SELECT provider_id FROM shop_market_live_settlements WHERE order_id=$1 AND seller_company_id=$2',[orderId,seller])).rows[0];if(!saved)fail('LIVE_ORDER_NOT_FOUND');
   const e=await evidence(seller,orderId,saved.provider_id),r=Object.freeze({...await providerFacts(()=>fetchRefund(Object.freeze({...e.b,orderId,providerId:saved.provider_id,refundId})))});
   return tx(async db=>{
    await db.query('SELECT id FROM shop_market_seller_orders WHERE id=$1 AND company_id=$2 FOR UPDATE',[orderId,seller]);
    const row=(await db.query('SELECT * FROM shop_market_live_settlements WHERE order_id=$1 AND seller_company_id=$2 FOR UPDATE',[orderId,seller])).rows[0];if(!row)fail('LIVE_ORDER_NOT_FOUND');
    if(!(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[seller])).rows.length)fail('LIVE_MERCHANT_NOT_VERIFIED');
    const b=binding(await loadBinding(seller,db),seller);if(b.connectionId!==row.connection_id||b.merchantId!==row.merchant_id||b.profileId!==row.profile_id||JSON.stringify(b)!==JSON.stringify(e.b))fail('LIVE_MERCHANT_CHANGED');
    const a=accepted(await loadAcceptance(seller,orderId,db),b,orderId);if(a.reference!==row.acceptance_reference||a.fiscalReference!==row.fiscal_reference||a.orderDigest!==row.order_digest)fail('LIVE_ACCEPTANCE_CHANGED');proof(e.p,b,orderId,row.provider_id,Number(row.gross_cents));
    if(!r||r.mode!=='live'||r.status!=='refunded'||r.id!==refundId||r.paymentId!==row.provider_id||r.orderId!==orderId||r.sellerCompanyId!==seller||r.merchantId!==b.merchantId||r.profileId!==b.profileId||r.currency!=='EUR'||!cents(r.amountCents)||r.amountCents<=0)fail('LIVE_REFUND_MISMATCH');
    const previous=(await db.query('SELECT * FROM shop_market_live_refunds WHERE refund_id=$1',[refundId])).rows[0];if(previous){if(previous.order_id!==orderId||Number(previous.amount_cents)!==r.amountCents)fail('LIVE_REFUND_CONFLICT');return {orderId,replay:true,canFulfil:false};}
    const total=Number((await db.query('SELECT COALESCE(sum(amount_cents),0) AS n FROM shop_market_live_refunds WHERE order_id=$1',[orderId])).rows[0].n)+r.amountCents;
    if(!Number.isSafeInteger(total)||total>Number(row.gross_cents)||total>e.p.amountRefundedCents)fail('LIVE_REFUND_EXCEEDS_PAID');
    await db.query('INSERT INTO shop_market_live_refunds(refund_id,order_id,amount_cents) VALUES($1,$2,$3)',[refundId,orderId,r.amountCents]);
    const handoff=(await db.query('SELECT state FROM shop_market_live_handoffs WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
    await db.query("UPDATE shop_market_live_handoffs SET state='blocked' WHERE order_id=$1 AND state='ready'",[orderId]);
    return {orderId,replay:false,canFulfil:false,fulfilmentReviewRequired:handoff?.state==='consumed'};
   });
  },
  async consume({sellerCompanyId:seller,orderId,receiptId}){
   requireEnabled();if(!uuid(seller)||!uuid(orderId)||!uuid(receiptId))fail('LIVE_SETTLEMENT_INPUT');
   const saved=(await pool.query('SELECT provider_id FROM shop_market_live_settlements WHERE order_id=$1 AND seller_company_id=$2',[orderId,seller])).rows[0];if(!saved)fail('LIVE_ORDER_NOT_FOUND');
   const e=await evidence(seller,orderId,saved.provider_id);
   return tx(async db=>{
    const order=(await db.query('SELECT * FROM shop_market_seller_orders WHERE id=$1 AND company_id=$2 FOR UPDATE',[orderId,seller])).rows[0];if(!order)fail('LIVE_ORDER_NOT_FOUND');
    const row=(await db.query('SELECT * FROM shop_market_live_settlements WHERE order_id=$1 AND seller_company_id=$2 FOR UPDATE',[orderId,seller])).rows[0];if(!row)fail('LIVE_ORDER_NOT_FOUND');
    if(!(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[seller])).rows.length)fail('LIVE_MERCHANT_NOT_VERIFIED');
    const b=binding(await loadBinding(seller,db),seller);if(b.connectionId!==row.connection_id||b.merchantId!==row.merchant_id||b.profileId!==row.profile_id||JSON.stringify(b)!==JSON.stringify(e.b))fail('LIVE_MERCHANT_CHANGED');
    const a=accepted(await loadAcceptance(seller,orderId,db),b,orderId);if(a.reference!==row.acceptance_reference||a.fiscalReference!==row.fiscal_reference||a.orderDigest!==row.order_digest)fail('LIVE_ACCEPTANCE_CHANGED');
    proof(e.p,b,orderId,row.provider_id,Number(row.gross_cents));
    if(e.p.amountRefundedCents!==0||(await db.query('SELECT 1 FROM shop_market_live_refunds WHERE order_id=$1',[orderId])).rows.length)fail('LIVE_HANDOFF_BLOCKED');
    const state=(await db.query('SELECT status FROM shop_market_order_state WHERE order_id=$1',[orderId])).rows[0]?.status||'received';if(!['received','accepted'].includes(state)||digest(order.snapshot)!==row.order_digest)fail('LIVE_HANDOFF_BLOCKED');
    const h=(await db.query('SELECT * FROM shop_market_live_handoffs WHERE order_id=$1 AND seller_company_id=$2 FOR UPDATE',[orderId,seller])).rows[0];if(!h||h.state==='blocked')fail('LIVE_HANDOFF_BLOCKED');
    if(h.state==='consumed'){if(h.receipt_id!==receiptId)fail('LIVE_HANDOFF_ALREADY_CONSUMED');return {orderId,receiptId,replay:true};}
    await db.query("UPDATE shop_market_live_handoffs SET state='consumed',receipt_id=$2 WHERE order_id=$1",[orderId,receiptId]);
    // Receipt is the unique durable acknowledgement, not a promise of external
    // exactly-once network delivery. Downstream consumers must reuse receiptId.
    return {orderId,receiptId,replay:false};
   });
  }
 };
}

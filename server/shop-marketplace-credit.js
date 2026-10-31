import crypto from 'node:crypto';
import {marketplaceCommissionRefund} from './shop-marketplace-commission.js';

// Internal accounting component, deliberately not an HTTP/payment endpoint.
// Callbacks must read trusted persisted allocation/charge/termination records.
export const marketplaceCreditPolicy='merchant-credit-termination-v1';
const fail=code=>{throw Error(code);};
const id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const reference=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
const cents=v=>Number.isSafeInteger(v)&&v>=0;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v,Object.keys(v).sort())).digest('hex');

export async function migrateMarketplaceCredit(pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query(`CREATE TABLE IF NOT EXISTS shop_market_credit_accounts(
   company_id uuid PRIMARY KEY REFERENCES companies(id),
   balance_cents bigint NOT NULL DEFAULT 0 CHECK(balance_cents BETWEEN 0 AND 9007199254740991),
   termination_reference text,terminated_at timestamptz,
   CHECK((termination_reference IS NULL)=(terminated_at IS NULL)))`);
  await db.query(`CREATE TABLE IF NOT EXISTS shop_market_credit_entries(
   company_id uuid NOT NULL REFERENCES shop_market_credit_accounts(company_id),
   kind text NOT NULL CHECK(kind IN ('refund','offset','release','payout')),
   reference text NOT NULL,digest text NOT NULL,amount_cents bigint NOT NULL,
   document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
   PRIMARY KEY(company_id,kind,reference),
   CHECK((kind IN ('refund','release') AND amount_cents>=0) OR (kind IN ('offset','payout') AND amount_cents<=0)))`);
  await db.query(`CREATE OR REPLACE FUNCTION shop_market_credit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'immutable marketplace credit'; END $$`);
  await db.query('DROP TRIGGER IF EXISTS shop_market_credit_immutable ON shop_market_credit_entries');
  await db.query('CREATE TRIGGER shop_market_credit_immutable BEFORE UPDATE OR DELETE ON shop_market_credit_entries FOR EACH ROW EXECUTE FUNCTION shop_market_credit_immutable()');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

export function createMarketplaceCredit(pool,{loadRefundAllocation,loadCommissionCharge,applyCommissionOffset,loadTermination,loadPayout}={}){
 async function transaction(companyId,fn){
  if(!id(companyId))fail('CREDIT_INVALID_COMPANY');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
   // One common lock for credits, offsets, termination and payout acknowledgement.
   await db.query('INSERT INTO shop_market_credit_accounts(company_id) VALUES($1) ON CONFLICT DO NOTHING',[companyId]);
   const account=(await db.query('SELECT * FROM shop_market_credit_accounts WHERE company_id=$1 FOR UPDATE',[companyId])).rows[0];
   const result=await fn(db,account);await db.query('COMMIT');return result;
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async function entry(db,companyId,kind,ref,document,amount,account){
  const digest=hash(document),old=(await db.query('SELECT digest,document,amount_cents FROM shop_market_credit_entries WHERE company_id=$1 AND kind=$2 AND reference=$3',[companyId,kind,ref])).rows[0];
  if(old){if(old.digest!==digest)fail('CREDIT_REFERENCE_CONFLICT');return {...old.document,amountCents:Number(old.amount_cents),replay:true};}
  const balance=Number(account.balance_cents)+amount;
  if(!cents(balance))fail('CREDIT_INSUFFICIENT_BALANCE');
  await db.query('INSERT INTO shop_market_credit_entries(company_id,kind,reference,digest,amount_cents,document) VALUES($1,$2,$3,$4,$5,$6)',[companyId,kind,ref,digest,amount,document]);
  await db.query('UPDATE shop_market_credit_accounts SET balance_cents=$2 WHERE company_id=$1',[companyId,balance]);
  return {...document,amountCents:amount,replay:false};
 }
 function requireCallback(fn){if(typeof fn!=='function')fail('CREDIT_TRUSTED_ADAPTER_REQUIRED');}
 return {
  async refund({companyId,orderId,refundId}){
   requireCallback(loadRefundAllocation);
   if(!id(orderId)||!/^re_[A-Za-z0-9]{1,100}$/.test(refundId||''))fail('CREDIT_INVALID_REFUND');
   return transaction(companyId,async(db,account)=>{
    const order=(await db.query('SELECT snapshot FROM shop_market_seller_orders WHERE id=$1 AND company_id=$2',[orderId,companyId])).rows[0];
    const confirmed=(await db.query(`SELECT r.amount_cents FROM shop_market_live_refunds r JOIN shop_market_live_settlements s ON s.order_id=r.order_id
     WHERE r.refund_id=$1 AND r.order_id=$2 AND s.seller_company_id=$3`,[refundId,orderId,companyId])).rows[0];
    if(!order||!confirmed)fail('CREDIT_CONFIRMED_REFUND_REQUIRED');
    const allocation=await loadRefundAllocation({db,companyId,orderId,refundId});
    // Gross refunds cannot be divided by a guessed tax rate. The allocation
    // adapter must verify line quantities/net/VAT/shipping against original rows.
    if(!allocation||allocation.policy!==marketplaceCreditPolicy||allocation.companyId!==companyId||allocation.orderId!==orderId||allocation.refundId!==refundId||allocation.verified!==true||!reference(allocation.reference)||!cents(allocation.goodsNetCents)||allocation.grossCents!==Number(confirmed.amount_cents)||allocation.commissionAccounted!==true||!cents(allocation.commissionAccountedNetCents)||allocation.commissionAccountedNetCents!==order.snapshot.commission?.feeNetCents)fail('CREDIT_VERIFIED_ALLOCATION_REQUIRED');
    const document={orderId,refundId,allocationReference:allocation.reference,goodsNetCents:allocation.goodsNetCents,grossCents:allocation.grossCents,policy:marketplaceCreditPolicy,currency:'EUR'};
    const old=(await db.query("SELECT document,amount_cents FROM shop_market_credit_entries WHERE company_id=$1 AND kind='refund' AND reference=$2",[companyId,refundId])).rows[0];
    if(old){if(hash(old.document)!==hash(document))fail('CREDIT_REFERENCE_CONFLICT');return {...old.document,amountCents:Number(old.amount_cents),replay:true};}
    const previous=Number((await db.query("SELECT COALESCE(sum((document->>'goodsNetCents')::bigint),0) AS n FROM shop_market_credit_entries WHERE company_id=$1 AND kind='refund' AND document->>'orderId'=$2",[companyId,orderId])).rows[0].n);
    const fee=marketplaceCommissionRefund(order.snapshot.commission,{previousRefundedGoodsNetCents:previous,refundedGoodsNetCents:previous+allocation.goodsNetCents});
    return entry(db,companyId,'refund',refundId,document,fee.refundFeeNetCents,account);
   });
  },
  async offset({companyId,chargeId}){
   requireCallback(loadCommissionCharge);requireCallback(applyCommissionOffset);if(!reference(chargeId))fail('CREDIT_INVALID_CHARGE');
   return transaction(companyId,async(db,account)=>{
    const charge=await loadCommissionCharge({db,companyId,chargeId});
    if(!charge||charge.companyId!==companyId||charge.chargeId!==chargeId||charge.policy!==marketplaceCreditPolicy||charge.status!=='reserved'||charge.currency!=='EUR'||!cents(charge.feeNetCents))fail('CREDIT_VERIFIED_CHARGE_REQUIRED');
    const document={chargeId,feeNetCents:charge.feeNetCents,policy:marketplaceCreditPolicy,currency:'EUR'};
    const old=(await db.query("SELECT document,amount_cents FROM shop_market_credit_entries WHERE company_id=$1 AND kind='offset' AND reference=$2",[companyId,chargeId])).rows[0];
    if(old){if(hash(old.document)!==hash(document))fail('CREDIT_REFERENCE_CONFLICT');return {...old.document,amountCents:Number(old.amount_cents),replay:true};}
    if(account.terminated_at)fail('CREDIT_ACCOUNT_TERMINATED');
    const amount=Math.min(Number(account.balance_cents),charge.feeNetCents);
    const result=await entry(db,companyId,'offset',chargeId,document,-amount,account);
    // Persist the reduced fee in the SAME transaction before provider dispatch.
    // No provider I/O here. Ambiguous dispatch must recover the saved chargeId.
    const applied=await applyCommissionOffset({db,companyId,chargeId,creditNetCents:amount,remainingFeeNetCents:charge.feeNetCents-amount});
    if(applied!==true)fail('CREDIT_OFFSET_NOT_PERSISTED');
    return result;
   });
  },
  async releaseOffset({companyId,chargeId}){
   requireCallback(loadCommissionCharge);if(!reference(chargeId))fail('CREDIT_INVALID_CHARGE');
   return transaction(companyId,async(db,account)=>{
    const charge=await loadCommissionCharge({db,companyId,chargeId});
    if(!charge||charge.companyId!==companyId||charge.chargeId!==chargeId||!['failed','canceled'].includes(charge.status)||charge.providerOutcomeVerified!==true)fail('CREDIT_FINAL_FAILED_CHARGE_REQUIRED');
    const old=(await db.query("SELECT amount_cents FROM shop_market_credit_entries WHERE company_id=$1 AND kind='offset' AND reference=$2",[companyId,chargeId])).rows[0];
    if(!old)fail('CREDIT_OFFSET_NOT_FOUND');
    return entry(db,companyId,'release',chargeId,{chargeId,currency:'EUR'},-Number(old.amount_cents),account);
   });
  },
  async terminate({companyId,terminationId}){
   requireCallback(loadTermination);if(!reference(terminationId))fail('CREDIT_INVALID_TERMINATION');
   return transaction(companyId,async(db,account)=>{
    const proof=await loadTermination({db,companyId,terminationId});
    if(!proof||proof.companyId!==companyId||proof.reference!==terminationId||proof.status!=='effective')fail('CREDIT_EFFECTIVE_TERMINATION_REQUIRED');
    if(account.termination_reference&&account.termination_reference!==terminationId)fail('CREDIT_REFERENCE_CONFLICT');
    await db.query('UPDATE shop_market_credit_accounts SET termination_reference=$2,terminated_at=COALESCE(terminated_at,clock_timestamp()) WHERE company_id=$1',[companyId,terminationId]);
    return {terminationId,balanceCents:Number(account.balance_cents),currency:'EUR',payoutEligible:true,replay:!!account.termination_reference};
   });
  },
  async acknowledgePayout({companyId,payoutId}){
   requireCallback(loadPayout);if(!reference(payoutId))fail('CREDIT_INVALID_PAYOUT');
   return transaction(companyId,async(db,account)=>{
    if(!account.terminated_at)fail('CREDIT_PAYOUT_REQUIRES_TERMINATION');
    const proof=await loadPayout({db,companyId,payoutId});
    if(!proof||proof.companyId!==companyId||proof.reference!==payoutId||proof.terminationId!==account.termination_reference||proof.status!=='paid'||proof.currency!=='EUR'||!cents(proof.amountCents)||proof.amountCents<=0)fail('CREDIT_CONFIRMED_PAYOUT_REQUIRED');
    return entry(db,companyId,'payout',payoutId,{payoutId,terminationId:proof.terminationId,payoutAmountCents:proof.amountCents,currency:'EUR'},-proof.amountCents,account);
   });
  },
  async balance({companyId}){
   return transaction(companyId,async(db,a)=>({currency:'EUR',balanceNetCents:Number(a.balance_cents),payoutEligible:!!a.terminated_at,policy:marketplaceCreditPolicy}));
  }
 };
}

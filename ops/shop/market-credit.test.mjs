import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {dependency} from './dependency.mjs';
import {marketplaceCommission} from '../../server/shop-marketplace-commission.js';
import {createMarketplaceCredit,migrateMarketplaceCredit,marketplaceCreditPolicy as policy} from '../../server/shop-marketplace-credit.js';

async function fixture(){
 const {PGlite}=await import(dependency('@electric-sql/pglite','SHOP_PGLITE_PATH'));
 const db=new PGlite();await db.waitReady;
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);
  CREATE TABLE shop_market_seller_orders(id uuid PRIMARY KEY,company_id uuid,snapshot jsonb);
  CREATE TABLE shop_market_live_settlements(order_id uuid PRIMARY KEY,seller_company_id uuid);
  CREATE TABLE shop_market_live_refunds(refund_id text PRIMARY KEY,order_id uuid,amount_cents bigint);
  CREATE TABLE test_charge(id text PRIMARY KEY,remaining bigint);`);
 const query=(s,p)=>db.query(s,p),pool={query,connect:async()=>({query,release(){}})};
 const companyId=crypto.randomUUID(),other=crypto.randomUUID(),orderId=crypto.randomUUID();
 await db.query('INSERT INTO companies VALUES($1),($2)',[companyId,other]);
 await db.query('INSERT INTO shop_market_seller_orders VALUES($1,$2,$3)',[orderId,companyId,{commission:marketplaceCommission(10000)}]);
 await db.query('INSERT INTO shop_market_live_settlements VALUES($1,$2)',[orderId,companyId]);
 const allocations=new Map(),charges=new Map(),terminations=new Map(),payouts=new Map();
 const adapters={loadRefundAllocation:async({refundId})=>allocations.get(refundId),loadCommissionCharge:async({chargeId})=>charges.get(chargeId),
  applyCommissionOffset:async({db,chargeId,remainingFeeNetCents})=>{await db.query('INSERT INTO test_charge VALUES($1,$2)',[chargeId,remainingFeeNetCents]);return true;},
  loadTermination:async({terminationId})=>terminations.get(terminationId),loadPayout:async({payoutId})=>payouts.get(payoutId)};
 await migrateMarketplaceCredit(pool);const api=createMarketplaceCredit(pool,adapters);
 async function refund(refundId,goodsNetCents,grossCents=goodsNetCents){
  await db.query('INSERT INTO shop_market_live_refunds VALUES($1,$2,$3)',[refundId,orderId,grossCents]);
  allocations.set(refundId,{policy,companyId,orderId,refundId,goodsNetCents,grossCents,verified:true,commissionAccounted:true,commissionAccountedNetCents:500,reference:'allocation_'+refundId});
  return api.refund({companyId,orderId,refundId});
 }
 function charge(chargeId,feeNetCents){charges.set(chargeId,{companyId,chargeId,feeNetCents,policy,status:'reserved',currency:'EUR'});return api.offset({companyId,chargeId});}
 function terminate(){terminations.set('term1',{companyId,reference:'term1',status:'effective'});return api.terminate({companyId,terminationId:'term1'});}
 return {db,pool,companyId,other,orderId,allocations,charges,terminations,payouts,adapters,api,refund,charge,terminate};
}
async function run(fn){const f=await fixture();try{await fn(f);}finally{await f.db.close();}}

test('full/partial refunds create durable net credit and replay without duplication',()=>run(async f=>{
 assert.equal((await f.refund('re_one',4000,4760)).amountCents,200);
 assert.equal((await f.api.refund({companyId:f.companyId,orderId:f.orderId,refundId:'re_one'})).replay,true);
 assert.equal((await f.refund('re_two',6000,7140)).amountCents,300);
 assert.equal((await f.api.balance({companyId:f.companyId})).balanceNetCents,500);
 await assert.rejects(()=>f.refund('re_three',1),/INVALID_COMMISSION_REFUND/);
 const restarted=createMarketplaceCredit(f.pool,f.adapters);
 assert.equal((await restarted.balance({companyId:f.companyId})).balanceNetCents,500);
}));
test('only confirmed tenant-bound refunds with verified net allocation are credited',()=>run(async f=>{
 const command={companyId:f.companyId,orderId:f.orderId,refundId:'re_missing'};
 await assert.rejects(()=>f.api.refund(command),/CONFIRMED_REFUND/);
 await f.refund('re_one',1000,1190);
 await assert.rejects(()=>f.api.refund({...command,companyId:f.other,refundId:'re_one'}),/CONFIRMED_REFUND/);
 const saved=f.allocations.get('re_one');
 for(const patch of [{verified:false},{grossCents:1191},{goodsNetCents:-1},{companyId:f.other},{policy:'old'},{commissionAccounted:false},{commissionAccountedNetCents:0}]){
  f.allocations.set('re_one',{...saved,...patch});await assert.rejects(()=>f.api.refund({...command,refundId:'re_one'}),/VERIFIED_ALLOCATION/);
 }
 f.allocations.set('re_one',{...saved,goodsNetCents:999});
 await assert.rejects(()=>f.api.refund({...command,refundId:'re_one'}),/REFERENCE_CONFLICT/);
 assert.equal((await f.api.balance({companyId:f.companyId})).balanceNetCents,50);
}));
test('offset caps at the fee; reserved provider fee is reduced in the same transaction',()=>run(async f=>{
 await f.refund('re_one',10000);
 assert.equal((await f.charge('charge1',200)).amountCents,-200);
 assert.equal((await f.charge('charge1',200)).replay,true);
 assert.equal((await f.charge('charge2',800)).amountCents,-300);
 assert.equal(Number((await f.db.query("SELECT remaining FROM test_charge WHERE id='charge2'")).rows[0].remaining),500);
 assert.equal((await f.api.balance({companyId:f.companyId})).balanceNetCents,0);
 await assert.rejects(()=>f.charge('charge2',801),/REFERENCE_CONFLICT/);
}));
test('failed charge persistence rolls back the credit debit and allows a clean retry',()=>run(async f=>{
 await f.refund('re_one',10000);
 const broken=createMarketplaceCredit(f.pool,{...f.adapters,applyCommissionOffset:async()=>false});
 f.charges.set('charge1',{companyId:f.companyId,chargeId:'charge1',policy,status:'reserved',currency:'EUR',feeNetCents:300});
 await assert.rejects(()=>broken.offset({companyId:f.companyId,chargeId:'charge1'}),/OFFSET_NOT_PERSISTED/);
 assert.equal((await f.api.balance({companyId:f.companyId})).balanceNetCents,500);
 assert.equal((await f.api.offset({companyId:f.companyId,chargeId:'charge1'})).amountCents,-300);
}));
test('only definitive failed/canceled charges release used credit, once',()=>run(async f=>{
 await f.refund('re_one',10000);await f.charge('charge1',300);
 await assert.rejects(()=>f.api.releaseOffset({companyId:f.companyId,chargeId:'charge1'}),/FINAL_FAILED_CHARGE/);
 f.charges.set('charge1',{companyId:f.companyId,chargeId:'charge1',status:'failed',providerOutcomeVerified:true});
 assert.equal((await f.api.releaseOffset({companyId:f.companyId,chargeId:'charge1'})).amountCents,300);
 assert.equal((await f.api.releaseOffset({companyId:f.companyId,chargeId:'charge1'})).replay,true);
 assert.equal((await f.api.balance({companyId:f.companyId})).balanceNetCents,500);
}));
test('payout requires effective termination and confirmed bank evidence; no forfeiture',()=>run(async f=>{
 await f.refund('re_one',4000);
 await assert.rejects(()=>f.api.acknowledgePayout({companyId:f.companyId,payoutId:'bank1'}),/REQUIRES_TERMINATION/);
 await assert.rejects(()=>f.api.terminate({companyId:f.companyId,terminationId:'term1'}),/EFFECTIVE_TERMINATION/);
 assert.equal((await f.terminate()).payoutEligible,true);assert.equal((await f.terminate()).replay,true);
 await assert.rejects(()=>f.charge('charge1',100),/ACCOUNT_TERMINATED/);
 await assert.rejects(()=>f.api.acknowledgePayout({companyId:f.companyId,payoutId:'bank1'}),/CONFIRMED_PAYOUT/);
 f.payouts.set('bank1',{companyId:f.companyId,reference:'bank1',terminationId:'term1',status:'paid',currency:'EUR',amountCents:200});
 assert.equal((await f.api.acknowledgePayout({companyId:f.companyId,payoutId:'bank1'})).amountCents,-200);
 assert.equal((await f.api.acknowledgePayout({companyId:f.companyId,payoutId:'bank1'})).replay,true);
 f.payouts.get('bank1').amountCents=199;
 await assert.rejects(()=>f.api.acknowledgePayout({companyId:f.companyId,payoutId:'bank1'}),/REFERENCE_CONFLICT/);
 // Late completed refunds after termination still accrue and remain payable.
 await f.refund('re_late',6000);
 assert.deepEqual(await f.api.balance({companyId:f.companyId}),{currency:'EUR',balanceNetCents:300,payoutEligible:true,policy});
 f.payouts.set('bank2',{companyId:f.companyId,reference:'bank2',terminationId:'term1',status:'paid',currency:'EUR',amountCents:301});
 await assert.rejects(()=>f.api.acknowledgePayout({companyId:f.companyId,payoutId:'bank2'}),/INSUFFICIENT_BALANCE/);
}));
test('migration re-entry, append-only journal and missing adapters fail closed',()=>run(async f=>{
 await migrateMarketplaceCredit(f.pool);await f.refund('re_one',10000);
 await assert.rejects(()=>f.db.query('DELETE FROM shop_market_credit_entries'),/immutable marketplace credit/);
 await assert.rejects(()=>f.db.query('UPDATE shop_market_credit_entries SET amount_cents=1'),/immutable marketplace credit/);
 const empty=createMarketplaceCredit(f.pool);
 await assert.rejects(()=>empty.refund({companyId:f.companyId,orderId:f.orderId,refundId:'re_one'}),/TRUSTED_ADAPTER/);
 await assert.rejects(()=>f.api.balance({companyId:'wrong'}),/INVALID_COMPANY/);
 assert.equal((await f.api.balance({companyId:f.other})).balanceNetCents,0);
}));

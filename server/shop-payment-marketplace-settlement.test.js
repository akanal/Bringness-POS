import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createMarketplaceLiveAccounting} from './shop-mollie-marketplace-live-integration.js';
import {fixture} from '../ops/shop/fixture.mjs';
import {migrateMarketplace} from './shop-marketplace.js';
import {createMarketplaceSettlement,migrateMarketplaceSettlement,marketplaceSettlementDigest} from './shop-payment-marketplace-settlement.js';

async function setup(external){
 const f=external||await fixture();await migrateMarketplace(f.pool);await migrateMarketplaceSettlement(f.pool);
 const orderId=randomUUID(),connectionId=randomUUID();
 await f.pool.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved','{}')",[f.a]);
 await f.pool.query('INSERT INTO shop_market_seller_orders(id,company_id,source_id,snapshot,shipment) VALUES($1,$2,$3,$4,$5)',[orderId,f.a,randomUUID(),{grossCents:1190,netCents:1000,vatCents:190,currency:'EUR',lines:[{quantity:1,unitNetCents:1000,vatBasisPoints:1900}]},{method:'pickup'}]);
 const binding={mode:'live',status:'verified',sellerCompanyId:f.a,connectionId,merchantId:'org_fixture',profileId:'pfl_fixture'};
 const snapshot=(await f.pool.query('SELECT snapshot FROM shop_market_seller_orders WHERE id=$1',[orderId])).rows[0].snapshot;
 const acceptance={orderDigest:marketplaceSettlementDigest(snapshot),mode:'live',sellerCompanyId:f.a,connectionId,merchantId:binding.merchantId,profileId:binding.profileId,orderId,reference:'acceptance-fixture',fiscalReference:'fiscal-fixture',merchantAccepted:true,accountingAccepted:true,fiscalAccepted:true,fulfilmentAccepted:true};
 const payment={mode:'live',status:'paid',id:'tr_fixture',orderId,sellerCompanyId:f.a,merchantId:binding.merchantId,profileId:binding.profileId,amountCents:1190,currency:'EUR',amountRefundedCents:0,amountChargedBackCents:0,feeCents:null};
 const refund={mode:'live',status:'refunded',id:'re_fixture',paymentId:payment.id,orderId,sellerCompanyId:f.a,merchantId:binding.merchantId,profileId:binding.profileId,currency:'EUR',amountCents:500};
 const deps={loadBinding:async()=>({...binding}),loadAcceptance:async()=>({...acceptance}),fetchPayment:async()=>({...payment}),fetchRefund:async()=>({...refund})};
 const service=createMarketplaceSettlement(f.pool,deps),args={sellerCompanyId:f.a,orderId,providerId:payment.id};
 return {...f,binding,acceptance,payment,refund,deps,service,args,close:()=>external?Promise.resolve():f.db.close()};
}
test('live journal uses original amounts, preserves unknown fees and records one immutable handoff',async()=>{
 const f=await setup();try{
  assert.equal((await f.service.settle(f.args)).replay,false);assert.equal((await f.service.settle(f.args)).replay,true);
  const row=(await f.pool.query('SELECT * FROM shop_market_live_settlements')).rows[0];assert.equal(Number(row.gross_cents),1190);assert.equal(Number(row.net_cents),1000);assert.equal(Number(row.vat_cents),190);assert.equal(row.fee_cents,null);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM shop_market_live_handoffs')).rows[0].n,1);
  await assert.rejects(f.pool.query('DELETE FROM shop_market_live_settlements'),/immutable marketplace accounting/);
  await assert.rejects(f.pool.query("INSERT INTO shop_market_order_state(order_id,status,revision) VALUES($1,'cancelled',1)",[f.args.orderId]),/LIVE_ORDER_TRANSITION_REQUIRES_INTEGRATION/);
  await f.pool.query("ALTER TABLE shop_market_order_state DISABLE TRIGGER shop_market_live_order_guard");
  await f.pool.query("INSERT INTO shop_market_order_state(order_id,status,revision) VALUES($1,'accepted',1)",[f.args.orderId]);
  await f.pool.query("ALTER TABLE shop_market_order_state ENABLE TRIGGER shop_market_live_order_guard");
  await assert.rejects(f.pool.query('DELETE FROM shop_market_order_state WHERE order_id=$1',[f.args.orderId]),/LIVE_ORDER_TRANSITION_REQUIRES_INTEGRATION/);
  const receiptId=randomUUID();assert.equal((await f.service.consume({...f.args,receiptId})).replay,false);assert.equal((await f.service.consume({...f.args,receiptId})).replay,true);
  await assert.rejects(f.service.consume({...f.args,receiptId:randomUUID()}),/LIVE_HANDOFF_ALREADY_CONSUMED/);
 }finally{await f.close();}
});
test('disabled service, TEST proof, wrong merchant/profile/currency/amount and chargebacks create no live records',async()=>{
 const f=await setup();try{
  await assert.rejects(createMarketplaceSettlement(f.pool).settle(f.args),/LIVE_SETTLEMENT_DISABLED/);
  const original={...f.payment};
  for(const change of [{mode:'test'},{merchantId:'org_other'},{profileId:'pfl_other'},{sellerCompanyId:f.b},{currency:'USD'},{amountCents:1189},{status:'open'},{amountChargedBackCents:1},{feeCents:-1},{feeCents:1.2},{amountRefundedCents:1}]){
   Object.assign(f.payment,original,change);await assert.rejects(f.service.settle(f.args),/LIVE_PAYMENT_MISMATCH|LIVE_REFUND_RECONCILIATION_REQUIRED/);
  }
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM shop_market_live_settlements')).rows[0].n,0);
 }finally{await f.close();}
});
test('each acceptance gate and revoked or replaced binding blocks settlement and late provider results',async()=>{
 const f=await setup();try{
  for(const key of ['merchantAccepted','accountingAccepted','fiscalAccepted','fulfilmentAccepted']){f.acceptance[key]=false;await assert.rejects(f.service.settle(f.args),/LIVE_ACCEPTANCE_REQUIRED/);f.acceptance[key]=true;}
  const service=createMarketplaceSettlement(f.pool,{...f.deps,fetchPayment:async()=>{f.binding.connectionId=randomUUID();return {...f.payment};}});
  await assert.rejects(service.settle(f.args),/LIVE_MERCHANT_CHANGED/);
  f.binding.mode='test';await assert.rejects(f.service.settle(f.args),/LIVE_MERCHANT_NOT_VERIFIED/);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM shop_market_live_handoffs')).rows[0].n,0);
 }finally{await f.close();}
});
test('provider timeout is bounded, secret errors are suppressed, and retry creates only one journal record',async()=>{
 const f=await setup();try{
  const stalled=createMarketplaceSettlement(f.pool,{...f.deps,providerTimeoutMs:10,fetchPayment:()=>new Promise(()=>{})});await assert.rejects(stalled.settle(f.args),/^Error: LIVE_PROVIDER_UNAVAILABLE$/);
  const failed=createMarketplaceSettlement(f.pool,{...f.deps,fetchPayment:()=>{throw Error('private-provider-token')}});await assert.rejects(failed.settle(f.args),/^Error: LIVE_PROVIDER_UNAVAILABLE$/);
  assert.equal((await f.service.settle(f.args)).replay,false);
 }finally{await f.close();}
});
test('confirmed partial/full refunds are idempotent, bounded and prevent handoff without manufacturing stock or credit notes',async()=>{
 const f=await setup();try{
  await f.service.settle(f.args);f.payment.amountRefundedCents=500;
  const args={...f.args,refundId:f.refund.id};assert.equal((await f.service.refund(args)).replay,false);assert.equal((await f.service.refund(args)).replay,true);
  await assert.rejects(f.service.consume({...f.args,receiptId:randomUUID()}),/LIVE_HANDOFF_BLOCKED/);
  f.refund.amountCents=501;await assert.rejects(f.service.refund(args),/LIVE_REFUND_CONFLICT/);
  f.refund.id='re_second';f.refund.amountCents=691;f.payment.amountRefundedCents=1190;await assert.rejects(f.service.refund({...args,refundId:f.refund.id}),/LIVE_REFUND_EXCEEDS_PAID/);
  f.refund.amountCents=690;await f.service.refund({...args,refundId:f.refund.id});
  assert.equal(Number((await f.pool.query('SELECT sum(amount_cents) n FROM shop_market_live_refunds')).rows[0].n),1190);
  await assert.rejects(f.pool.query('DELETE FROM shop_market_live_refunds'),/immutable marketplace accounting/);
 }finally{await f.close();}
});
test('revocation after settlement blocks handoff; refunds after consumption explicitly require fulfilment review',async()=>{
 const f=await setup();try{
  await f.service.settle(f.args);await f.pool.query("UPDATE shop_market_sellers SET status='suspended' WHERE company_id=$1",[f.a]);
  await assert.rejects(f.service.consume({...f.args,receiptId:randomUUID()}),/LIVE_MERCHANT_NOT_VERIFIED/);
  await f.pool.query("UPDATE shop_market_sellers SET status='approved' WHERE company_id=$1",[f.a]);await f.service.consume({...f.args,receiptId:randomUUID()});
  f.payment.amountRefundedCents=500;assert.equal((await f.service.refund({...f.args,refundId:f.refund.id})).fulfilmentReviewRequired,true);assert.equal((await f.service.refund({...f.args,refundId:f.refund.id})).fulfilmentReviewRequired,true);
 }finally{await f.close();}
});
const connectionString=process.env.MARKET_CHECKOUT_TEST_DATABASE_URL;
test('real PostgreSQL serializes live settlement, refund and handoff across independent callers',{skip:!connectionString,timeout:30000},async()=>{
 const url=new URL(connectionString);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/bringness_checkout_test')throw Error('ISOLATED_CHECKOUT_DATABASE_REQUIRED');
 const schema='live_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString});let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString,max:10,options:'-c search_path='+schema});
  await pool.query('CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean);CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz)');
  const a=randomUUID(),b=randomUUID();await pool.query('INSERT INTO companies VALUES($1),($2)',[a,b]);const f=await setup({pool,a,b});
  const settles=await Promise.all(Array.from({length:8},()=>f.service.settle(f.args)));assert.equal(settles.filter(r=>!r.replay).length,1);
  const competing=await Promise.allSettled(Array.from({length:8},()=>f.service.consume({...f.args,receiptId:randomUUID()})));assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  const receiptId=competing.find(r=>r.status==='fulfilled').value.receiptId;const receipts=await Promise.all(Array.from({length:8},()=>f.service.consume({...f.args,receiptId})));assert.equal(receipts.filter(r=>r.replay).length,8);
  f.payment.amountRefundedCents=500;const refunds=await Promise.all(Array.from({length:8},()=>f.service.refund({...f.args,refundId:f.refund.id})));assert.equal(refunds.filter(r=>!r.replay).length,1);
  f.payment.amountRefundedCents=1190;const competingRefunds=await Promise.allSettled(['re_second','re_third'].map(refundId=>createMarketplaceSettlement(pool,{...f.deps,fetchRefund:async()=>({...f.refund,id:refundId,amountCents:500})}).refund({...f.args,refundId})));assert.equal(competingRefunds.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM shop_market_live_settlements')).rows[0].n,1);assert.equal((await pool.query('SELECT count(*)::int n FROM shop_market_live_refunds')).rows[0].n,2);assert.equal(Number((await pool.query('SELECT sum(amount_cents) n FROM shop_market_live_refunds')).rows[0].n),1000);
 }finally{if(pool)await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});

test('stored legal identity cannot be replaced while retaining a connection revision',async()=>{
 const f=await setup();try{
  await f.service.settle(f.args);f.binding.profileId='pfl_other';f.acceptance.profileId='pfl_other';f.payment.profileId='pfl_other';f.refund.profileId='pfl_other';
  await assert.rejects(f.service.settle(f.args),/LIVE_SETTLEMENT_CONFLICT/);
  await assert.rejects(f.service.consume({...f.args,receiptId:randomUUID()}),/LIVE_MERCHANT_CHANGED/);
  f.payment.amountRefundedCents=500;await assert.rejects(f.service.refund({...f.args,refundId:f.refund.id}),/LIVE_MERCHANT_CHANGED/);
 }finally{await f.close();}
});
test('rolled-back handoff writes leave no partial journal and retry is safe',async()=>{
 const f=await setup();try{
  await f.pool.query(`CREATE FUNCTION fixture_fail_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture handoff failure'; END $$`);
  await f.pool.query('CREATE TRIGGER fixture_fail BEFORE INSERT ON shop_market_live_handoffs FOR EACH ROW EXECUTE FUNCTION fixture_fail_handoff()');
  await assert.rejects(f.service.settle(f.args),/fixture handoff failure/);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM shop_market_live_settlements')).rows[0].n,0);
  await f.pool.query('DROP TRIGGER fixture_fail ON shop_market_live_handoffs');assert.equal((await f.service.settle(f.args)).replay,false);
 }finally{await f.close();}
});


test('TEST orders, canceled orders and acceptance changes cannot reach live accounting',async()=>{
 const f=await setup();try{
  const changed=createMarketplaceSettlement(f.pool,{...f.deps,fetchPayment:async()=>{f.acceptance.reference='superseded';return {...f.payment};}});
  await assert.rejects(changed.settle(f.args),/LIVE_ACCEPTANCE_CHANGED/);
  await f.pool.query("INSERT INTO shop_market_order_state(order_id,status,revision) VALUES($1,'cancelled',1)",[f.args.orderId]);
  await assert.rejects(f.service.settle(f.args),/LIVE_ORDER_NOT_PAYABLE/);
  await f.pool.query('DELETE FROM shop_market_order_state WHERE order_id=$1',[f.args.orderId]);
  await f.pool.query("INSERT INTO shop_market_test_checkouts(order_id,buyer_company_id,seller_company_id,intent_id,merchant_id,amount_cents,currency,state) VALUES($1,$2,$3,$4,'fixture',1190,'EUR','prepared')",[f.args.orderId,f.b,f.a,randomUUID()]);
  await assert.rejects(f.service.settle(f.args),/LIVE_TEST_ORDER_FORBIDDEN/);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM shop_market_live_settlements')).rows[0].n,0);
 }finally{await f.close();}
});


test('confirmed provider fees are separate expenses and may exceed a small order without changing revenue',async()=>{
 const f=await setup();try{
  f.payment.feeCents=1200;await f.service.settle(f.args);
  const r=(await f.pool.query('SELECT gross_cents,fee_cents FROM shop_market_live_settlements')).rows[0];
  assert.equal(Number(r.gross_cents),1190);assert.equal(Number(r.fee_cents),1200);
 }finally{await f.close();}
});


test('failed settlement migration rolls back all new structures and a repeat succeeds',async()=>{
 const f=await fixture();try{
  await migrateMarketplace(f.pool);
  const broken={connect:async()=>{const db=await f.pool.connect();return {release:()=>db.release(),query:async(sql,args)=>{if(sql.startsWith('CREATE TABLE IF NOT EXISTS shop_market_live_refunds'))throw Error('fixture migration failure');return db.query(sql,args);}};}};
  await assert.rejects(migrateMarketplaceSettlement(broken),/fixture migration failure/);
  assert.equal((await f.pool.query("SELECT to_regclass('shop_market_live_settlements') AS name")).rows[0].name,null);
  await migrateMarketplaceSettlement(f.pool);await migrateMarketplaceSettlement(f.pool);
  assert.ok((await f.pool.query("SELECT to_regclass('shop_market_live_settlements') AS name")).rows[0].name);
 }finally{await f.db.close();}
});


test('read-only live OAuth composition verifies provider facts before atomic journal/refund writes',async()=>{
 const f=await setup();try{
  const key='market-live:'+randomUUID(),methods=[];
  const service=createMarketplaceLiveAccounting(f.pool,{...f.deps,withAccessToken:async(_seller,_id,fn)=>fn('fixture_oauth_access'),fetcher:async(url,options)=>{
   methods.push(options.method);let raw;const path=new URL(url).pathname;
   if(path.endsWith('/organizations/me'))raw={id:f.binding.merchantId};
   else if(path.endsWith('/profiles/'+f.binding.profileId))raw={id:f.binding.profileId,status:'verified'};
   else if(path.includes('/refunds/'))raw={resource:'refund',mode:'live',id:f.refund.id,paymentId:f.payment.id,status:'refunded',amount:{currency:'EUR',value:'5.00'}};
   else raw={resource:'payment',mode:'live',id:f.payment.id,profileId:f.binding.profileId,sequenceType:'oneoff',status:'paid',amount:{currency:'EUR',value:'11.90'},amountRefunded:{currency:'EUR',value:(f.payment.amountRefundedCents/100).toFixed(2)},metadata:{marketOrderId:f.args.orderId,marketSellerCompanyId:f.a,marketCheckoutKey:key}};
   return new Response(JSON.stringify(raw),{headers:{'Content-Type':'application/hal+json'}});
  }});
  assert.equal((await service.settle(f.args)).replay,false);f.payment.amountRefundedCents=500;assert.equal((await service.refund({...f.args,refundId:f.refund.id})).replay,false);
  await assert.rejects(service.consume({...f.args,receiptId:randomUUID()}),/LIVE_HANDOFF_BLOCKED/);assert.ok(methods.every(method=>method==='GET'));
 }finally{await f.close();}
});

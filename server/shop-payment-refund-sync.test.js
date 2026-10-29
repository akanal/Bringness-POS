import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopPaymentLedger,initializeShopPaymentLedger,bindShopPaymentProvider,recordShopPaymentEvent} from './shop-payment-ledger-pg.js';
import {reconcileShopRefund} from './shop-payment-refund-sync.js';
const orderId='33333333-3333-4333-8333-333333333333',companyId='11111111-1111-4111-8111-111111111111';
test('confirmed partial and full refunds are recorded once and never exceed paid total',async()=>{
 const db=new PGlite();const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await initializeShopPaymentLedger(pool,{orderId,companyId,amountCents:1000,currency:'EUR'});
  await bindShopPaymentProvider(pool,{orderId,companyId,providerReference:'tr_1000'});
  await recordShopPaymentEvent(pool,{orderId,companyId,event:{id:'tr_1000',kind:'paid',amountCents:1000,providerReference:'tr_1000',verified:true}});
  const fetchProviderRefund=async(paymentId,refundId)=>({id:refundId,paymentId,orderId,currency:'EUR',amountCents:refundId==='re_1'?300:700,status:'refunded'});
  const base={pool,orderId,companyId,fetchProviderRefund,fetchProviderPayment:async()=>({id:'tr_1000',orderId,currency:'EUR',amountCents:1000,status:'paid'})};
  assert.equal((await reconcileShopRefund({...base,refundId:'re_1'})).snapshot.status,'partially_refunded');
  assert.equal((await reconcileShopRefund({...base,refundId:'re_1'})).replay,true);
  assert.equal((await reconcileShopRefund({...base,refundId:'re_2'})).snapshot.status,'refunded');
  await assert.rejects(reconcileShopRefund({...base,refundId:'re_3'}),/EXCEEDS_PAID/);
 }finally{await db.close();}
});

test('refund without metadata requires verified parent payment order',async()=>{
 const db=new PGlite();const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await initializeShopPaymentLedger(pool,{orderId,companyId,amountCents:500,currency:'EUR'});
  await bindShopPaymentProvider(pool,{orderId,companyId,providerReference:'tr_parent'});
  await recordShopPaymentEvent(pool,{orderId,companyId,event:{id:'tr_parent',kind:'paid',amountCents:500,providerReference:'tr_parent',verified:true}});
  const args={pool,orderId,companyId,refundId:'re_parent',fetchProviderRefund:async()=>({id:'re_parent',paymentId:'tr_parent',currency:'EUR',amountCents:500,status:'refunded'})};
  await assert.rejects(reconcileShopRefund(args),/ADAPTER_REQUIRED/);
  let refundFetches=0;
  await assert.rejects(reconcileShopRefund({...args,fetchProviderRefund:async()=>{refundFetches++;return {};},fetchProviderPayment:async()=>({id:'tr_parent',orderId:'other',currency:'EUR',amountCents:500,status:'paid'})}),/PARENT_PAYMENT_MISMATCH/);
  assert.equal(refundFetches,0);
  await assert.rejects(reconcileShopRefund({...args,fetchProviderPayment:async()=>({id:'tr_parent',orderId,currency:'EUR',amountCents:499,status:'paid'})}),/PARENT_PAYMENT_MISMATCH/);
  await assert.rejects(reconcileShopRefund({...args,fetchProviderPayment:async()=>({id:'tr_parent',orderId,currency:'EUR',amountCents:500,status:'open'})}),/PARENT_PAYMENT_MISMATCH/);
  assert.equal((await reconcileShopRefund({...args,fetchProviderPayment:async()=>({id:'tr_parent',orderId,currency:'EUR',amountCents:500,status:'paid'})})).snapshot.status,'refunded');
 }finally{await db.close()}
});

test('corrupt stored amount is rejected before provider fetch',async()=>{
 let calls=0;
 const pool={query:async()=>({rows:[{provider_reference:'tr_123',currency:'EUR',amount_cents:'9007199254740993'}]})};
 await assert.rejects(reconcileShopRefund({pool,orderId,companyId,refundId:'re_1',fetchProviderRefund:async()=>{calls++;return {};},fetchProviderPayment:async()=>{calls++;return {};}}),/REFUND_PAYMENT_AMOUNT_INVALID/);
 assert.equal(calls,0);
});

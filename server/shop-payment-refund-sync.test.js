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
  const base={pool,orderId,companyId,fetchProviderRefund};
  assert.equal((await reconcileShopRefund({...base,refundId:'re_1'})).snapshot.status,'partially_refunded');
  assert.equal((await reconcileShopRefund({...base,refundId:'re_1'})).replay,true);
  assert.equal((await reconcileShopRefund({...base,refundId:'re_2'})).snapshot.status,'refunded');
  await assert.rejects(reconcileShopRefund({...base,refundId:'re_3'}),/EXCEEDS_PAID/);
 }finally{await db.close();}
});

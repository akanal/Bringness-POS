import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopPaymentLedger,initializeShopPaymentLedger,bindShopPaymentProvider} from './shop-payment-ledger-pg.js';
import {reconcileShopPayment} from './shop-payment-provider-sync.js';
const orderId='33333333-3333-4333-8333-333333333333',companyId='11111111-1111-4111-8111-111111111111';
test('reconciliation reads bound provider reference and only records verified paid result',async()=>{
 const db=new PGlite();
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await initializeShopPaymentLedger(pool,{orderId,companyId,amountCents:500,currency:'EUR'});
  await assert.rejects(reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment:async()=>({})}),/NOT_BOUND/);
  await bindShopPaymentProvider(pool,{orderId,companyId,providerReference:'tr_500'});
  const valid={id:'tr_500',orderId,amountCents:500,currency:'EUR',status:'paid'};
  for(const bad of [{...valid,status:'pending'},{...valid,amountCents:499},{...valid,orderId:'different'},{...valid,id:'tr_wrong'}]){
   await assert.rejects(reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment:async()=>bad}));
  }
  assert.equal((await db.query('SELECT snapshot FROM shop_payment_ledger WHERE order_id=$1',[orderId])).rows[0].snapshot.status,'unpaid');
  const fetchProviderPayment=async reference=>{assert.equal(reference,'tr_500');return valid;};
  assert.equal((await reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment})).snapshot.status,'paid');
  assert.equal((await reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment})).replay,true);
 }finally{await db.close();}
});

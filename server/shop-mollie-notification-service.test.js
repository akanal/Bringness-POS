import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopPaymentLedger,initializeShopPaymentLedger,bindShopPaymentProvider} from './shop-payment-ledger-pg.js';
import {processShopMollieNotification} from './shop-mollie-notification-service.js';
const orderId='33333333-3333-4333-8333-333333333333',companyId='11111111-1111-4111-8111-111111111111';
test('notification never trusts body and verifies paid status from provider',async()=>{
 const db=new PGlite();
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await initializeShopPaymentLedger(pool,{orderId,companyId,amountCents:500,currency:'EUR'});
  await bindShopPaymentProvider(pool,{orderId,companyId,providerReference:'tr_500'});
  let status='open',calls=0;
  const fetchProviderPayment=async id=>{assert.equal(id,'tr_500');calls++;return {id,orderId,amountCents:500,currency:'EUR',status};};
  const args={pool,body:'id=tr_500',fetchProviderPayment};
  await assert.rejects(processShopMollieNotification(args),/NOT_PAID/);
  await assert.rejects(processShopMollieNotification({...args,body:'id=tr_500&status=paid'}),/FIELDS_INVALID/);
  assert.equal((await db.query('SELECT snapshot FROM shop_payment_ledger WHERE order_id=$1',[orderId])).rows[0].snapshot.status,'unpaid');
  status='paid';
  assert.equal((await processShopMollieNotification(args)).snapshot.status,'paid');
  assert.equal((await processShopMollieNotification(args)).replay,true);
  assert.equal(calls,3);
 }finally{await db.close();}
});

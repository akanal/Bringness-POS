import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateShopPaymentLedger,initializeShopPaymentLedger,recordShopPaymentEvent} from './shop-payment-ledger-pg.js';
const company='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',order='33333333-3333-4333-8333-333333333333';
test('persistent ledger enforces order amount, tenant isolation, replay and rollback',async()=>{
 const db=new PGlite();
 const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})};
 try{
  await migrateShopPaymentLedger(pool);
  await initializeShopPaymentLedger(pool,{orderId:order,companyId:company,amountCents:1000,currency:'EUR'});
  assert.equal((await initializeShopPaymentLedger(pool,{orderId:order,companyId:company,amountCents:1000,currency:'EUR'})).status,'unpaid');
  await assert.rejects(initializeShopPaymentLedger(pool,{orderId:order,companyId:other,amountCents:1000,currency:'EUR'}),/LEDGER_CONFLICT/);
  await assert.rejects(initializeShopPaymentLedger(pool,{orderId:order,companyId:company,amountCents:900,currency:'EUR'}),/LEDGER_CONFLICT/);
  await assert.rejects(recordShopPaymentEvent(pool,{orderId:order,companyId:other,event:{id:'p',kind:'paid',amountCents:1000,verified:true}}),/ORDER_NOT_FOUND/);
  const event={id:'p',kind:'paid',amountCents:1000,verified:true};
  assert.equal((await recordShopPaymentEvent(pool,{orderId:order,companyId:company,event})).snapshot.status,'paid');
  assert.equal((await recordShopPaymentEvent(pool,{orderId:order,companyId:company,event})).replay,true);
  assert.equal((await initializeShopPaymentLedger(pool,{orderId:order,companyId:company,amountCents:1000,currency:'EUR'})).status,'paid');
  await assert.rejects(recordShopPaymentEvent(pool,{orderId:order,companyId:company,event:{id:'r',kind:'refund',amountCents:1001,verified:true}}),/EXCEEDS_PAID/);
  assert.equal((await db.query('SELECT snapshot FROM shop_payment_ledger WHERE order_id=$1',[order])).rows[0].snapshot.status,'paid');
  assert.equal((await recordShopPaymentEvent(pool,{orderId:order,companyId:company,event:{id:'r',kind:'refund',amountCents:1000,verified:true}})).snapshot.status,'refunded');
 }finally{await db.close()}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileShopRefundNotifications} from './shop-mollie-refund-notification.js';
const pool={query:async()=>({rows:[{provider_reference:'tr_123'}]})};
const base={pool,orderId:'order-1',companyId:'company-1',fetchProviderRefund:async()=>({}),fetchProviderPayment:async()=>({id:'tr_123',orderId:'order-1',currency:'EUR'})};
test('refund list rejects malformed, oversized and missing provider records',async()=>{
 await assert.rejects(reconcileShopRefundNotifications({...base,listProviderRefunds:async()=>null}),/RESPONSE_INVALID/);
 await assert.rejects(reconcileShopRefundNotifications({...base,listProviderRefunds:async()=>Array(101).fill({id:'re_1',status:'pending'})}),/RESPONSE_INVALID/);
 await assert.rejects(reconcileShopRefundNotifications({...base,listProviderRefunds:async()=>[{id:'invalid',status:'refunded'}]}),/REFERENCE_INVALID/);
 await assert.rejects(reconcileShopRefundNotifications({...base,pool:{query:async()=>({rows:[]})},listProviderRefunds:async()=>[]}),/PAYMENT_NOT_FOUND/);
});
test('pending refunds are skipped and duplicate IDs rejected',async()=>{
 const result=await reconcileShopRefundNotifications({...base,listProviderRefunds:async id=>{assert.equal(id,'tr_123');return [{id:'re_1',status:'pending'}]}});
 assert.deepEqual(result,[]);
 await assert.rejects(reconcileShopRefundNotifications({...base,listProviderRefunds:async()=>[{id:'re_1',status:'pending'},{id:'re_1',status:'refunded'}]}),/REFERENCE_DUPLICATE/);
});

test('invalid later refund prevents any provider fetch or ledger mutation',async()=>{
 let fetched=0;
 await assert.rejects(reconcileShopRefundNotifications({...base,fetchProviderRefund:async()=>{fetched++;return {};},listProviderRefunds:async()=>[{id:'re_1',status:'refunded'},{id:'invalid',status:'refunded'}]}),/REFERENCE_INVALID/);
 assert.equal(fetched,0);
 await assert.rejects(reconcileShopRefundNotifications({...base,fetchProviderRefund:async()=>{fetched++;return {};},listProviderRefunds:async()=>[{id:'re_1',status:'refunded'},{id:'re_2',status:'unexpected'}]}),/STATUS_INVALID/);
 assert.equal(fetched,0);
});

test('refund batch refuses missing parent-payment verification adapter',async()=>{
 const {fetchProviderPayment,...withoutParent}=base;
 await assert.rejects(reconcileShopRefundNotifications({...withoutParent,listProviderRefunds:async()=>[]}),/ADAPTER_REQUIRED/);
});

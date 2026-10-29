import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopMollieRefundFetcher} from './shop-mollie-refund-adapter.js';
const apiKey='test_12345678901234567890';
test('read-only refund fetcher retrieves provider facts',async()=>{
 let url,options;
 const fetchImpl=async(u,o)=>{url=u;options=o;return {ok:true,json:async()=>({id:'re_456',paymentId:'tr_123',metadata:{shopOrderId:'order-1'},amount:{value:'3.50',currency:'EUR'},status:'refunded'})};};
 const fetchRefund=createShopMollieRefundFetcher({apiKey,fetchImpl});
 assert.deepEqual(await fetchRefund('tr_123','re_456'),{id:'re_456',paymentId:'tr_123',orderId:'order-1',currency:'EUR',amountCents:350,status:'refunded'});
 assert.match(url,/\/payments\/tr_123\/refunds\/re_456$/);
 assert.equal(options.method,'GET');
});
test('refund fetcher rejects malformed IDs, amounts and provider failures',async()=>{
 const invalid=createShopMollieRefundFetcher({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({amount:{value:'3.500',currency:'EUR'}})})});
 await assert.rejects(invalid('tr_123','re_456'),/AMOUNT_INVALID/);
 await assert.rejects(invalid('tr_123','bad'),/REFERENCE_INVALID/);
 const failed=createShopMollieRefundFetcher({apiKey,fetchImpl:async()=>({ok:false})});
 await assert.rejects(failed('tr_123','re_456'),/FETCH_FAILED/);
});

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
 const invalid=createShopMollieRefundFetcher({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({id:'re_456',paymentId:'tr_123',amount:{value:'3.500',currency:'EUR'}})})});
 await assert.rejects(invalid('tr_123','re_456'),/AMOUNT_INVALID/);
 await assert.rejects(invalid('tr_123','bad'),/REFERENCE_INVALID/);
 const failed=createShopMollieRefundFetcher({apiKey,fetchImpl:async()=>({ok:false})});
 await assert.rejects(failed('tr_123','re_456'),/FETCH_FAILED/);
});

test('refund fetcher rejects mismatched provider refund and payment IDs',async()=>{
 for(const payload of [
  {id:'re_other',paymentId:'tr_123'},
  {id:'re_456',paymentId:'tr_other'}
 ]){
  const fetchRefund=createShopMollieRefundFetcher({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({...payload,amount:{value:'3.50',currency:'EUR'},status:'refunded'})})});
  await assert.rejects(fetchRefund('tr_123','re_456'),/REFERENCE_MISMATCH/);
 }
});

test('refund fetcher refuses unexpected response content types',async()=>{
 const fetchRefund=createShopMollieRefundFetcher({apiKey,fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'},json:async()=>({})})});
 await assert.rejects(fetchRefund('tr_123','re_456'),/CONTENT_TYPE_INVALID/);
});

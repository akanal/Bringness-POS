import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopMollieRefundLister} from './shop-mollie-refund-list-adapter.js';
const apiKey='test_12345678901234567890';
test('lists refunds from server-side Mollie API',async()=>{
 let url,options;
 const list=createShopMollieRefundLister({apiKey,fetchImpl:async(u,o)=>{url=u;options=o;return {ok:true,json:async()=>({_embedded:{refunds:[{id:'re_123',status:'refunded'}]}})}}});
 assert.deepEqual(await list('tr_123'),[{id:'re_123',status:'refunded'}]);
 assert.match(url,/\/payments\/tr_123\/refunds\?limit=100$/);
 assert.equal(options.method,'GET');
});
test('rejects invalid references, incomplete pagination, and bad responses',async()=>{
 const list=createShopMollieRefundLister({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({_embedded:{refunds:[]},_links:{next:{href:'https://example.invalid/next'}}})})});
 await assert.rejects(list('tr_123'),/PAGINATION_REQUIRED/);
 const truncated=createShopMollieRefundLister({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({count:2,_embedded:{refunds:[{id:'re_1',status:'refunded'}]}})})});
 await assert.rejects(truncated('tr_123'),/PAGINATION_REQUIRED/);
 await assert.rejects(list('invalid'),/REFERENCE_INVALID/);
 const failed=createShopMollieRefundLister({apiKey,fetchImpl:async()=>({ok:false})});
 await assert.rejects(failed('tr_123'),/FETCH_FAILED/);
});

test('rejects malformed, unknown-status and duplicate refund entries',async()=>{
 for(const refunds of [
  [{id:'bad',status:'refunded'}],
  [{id:'re_123',status:'unknown'}],
  [{id:'re_123',status:'refunded'},{id:'re_123',status:'pending'}],
  [null]
 ]){
  const list=createShopMollieRefundLister({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({_embedded:{refunds}})})});
  await assert.rejects(list('tr_123'),/MOLLIE_REFUND_LIST_(INVALID|DUPLICATE)/);
 }
});

test('refund listing rejects non-JSON provider response',async()=>{
 const list=createShopMollieRefundLister({apiKey,fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'},json:async()=>({_embedded:{refunds:[]}})})});
 await assert.rejects(list('tr_123'),/CONTENT_TYPE_INVALID/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopMolliePaymentFetcher} from './shop-mollie-payment-adapter.js';
const apiKey='test_12345678901234567890';
test('Mollie adapter fetches provider facts without exposing API key in results',async()=>{
 let request;
 const fetchImpl=async(url,opts)=>{request={url,opts};return {ok:true,json:async()=>({id:'tr_123',metadata:{shopOrderId:'order-123'},amount:{value:'34.99',currency:'EUR'},status:'paid'})};};
 const fetchPayment=createShopMolliePaymentFetcher({apiKey,fetchImpl});
 assert.deepEqual(await fetchPayment('tr_123'),{id:'tr_123',orderId:'order-123',amountCents:3499,currency:'EUR',status:'paid'});
 assert.equal(request.url,'https://api.mollie.com/v2/payments/tr_123');
 assert.equal(request.opts.headers.Authorization,`Bearer ${apiKey}`);
 assert.equal(request.opts.method,'GET');
});
test('Mollie adapter rejects invalid references, malformed amounts and HTTP errors',async()=>{
 const bad=createShopMolliePaymentFetcher({apiKey,fetchImpl:async()=>({ok:true,json:async()=>({id:'tr_123',amount:{value:'12.345',currency:'EUR'},status:'paid'})})});
 await assert.rejects(bad('tr_123'),/AMOUNT_INVALID/);
 await assert.rejects(bad('https://example.com'),/REFERENCE_INVALID/);
 const failed=createShopMolliePaymentFetcher({apiKey,fetchImpl:async()=>({ok:false,status:401})});
 await assert.rejects(failed('tr_123'),/FETCH_FAILED/);
 assert.throws(()=>createShopMolliePaymentFetcher({apiKey:'bad'}),/API_KEY_INVALID/);
});

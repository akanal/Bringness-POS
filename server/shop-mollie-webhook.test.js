import test from 'node:test';
import assert from 'node:assert/strict';
import {parseShopMollieWebhook,findShopPaymentByProviderReference} from './shop-mollie-webhook.js';
test('Mollie webhook parser returns reference only',()=>{
 assert.deepEqual(parseShopMollieWebhook('id=tr_123'),{providerReference:'tr_123'});
 for(const body of ['id=tr_123&id=tr_456','id=tr_123&status=paid','status=paid','id=https%3A%2F%2Fevil.test','id=','id=tr_123&id=tr_123'])assert.throws(()=>parseShopMollieWebhook(body));
});
test('provider reference resolves only a known stored order',async()=>{
 const pool={query:async(sql,args)=>{assert.match(sql,/WHERE provider_reference=\$1/);assert.deepEqual(args,['tr_123']);return {rows:[{order_id:'order-1',company_id:'merchant-1'}]};}};
 assert.deepEqual(await findShopPaymentByProviderReference(pool,'tr_123'),{orderId:'order-1',companyId:'merchant-1'});
 await assert.rejects(findShopPaymentByProviderReference({query:async()=>({rows:[]})},'tr_123'),/NOT_FOUND/);
});

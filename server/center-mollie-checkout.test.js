import test from 'node:test';
import assert from 'node:assert/strict';
import {createCenterMollieCheckout} from './center-mollie-checkout.js';
const env={CENTER_PAYMENT_ORIGIN:'https://example.test'};
test('lost payment response blocks blind retries',async()=>{const r=await createCenterMollieCheckout({query:async()=>({rows:[{attempted_at:'now'}]})},'attempt',env,()=>{throw Error('must not repeat payment')});assert.equal(r.reconciliationRequired,true);});
test('completed creation reuses checkout URL',async()=>{const r=await createCenterMollieCheckout({query:async()=>({rows:[{checkout_url:'https://www.mollie.com/checkout/test'}]})},'attempt',env);assert.equal(r.alreadyCreated,true);});
test('unverified merchant cannot create checkout',async()=>assert.rejects(createCenterMollieCheckout({query:async()=>({rows:[{status:'payment_pending',active:true,contract_status:'signed',payment_status:'pending'}]})},'attempt',env),/CHECKOUT_NOT_READY/));
import {matchingCheckoutPayments} from './center-mollie-checkout.js';
test('reconciliation matches checkout, order, merchant profile and amount',()=>{
 const attempt={id:'attempt',order_id:'order',total_cents:1250,request_payload:{profileId:'pfl_restaurant'}};
 const match={id:'tr_match',profileId:'pfl_restaurant',amount:{value:'12.50',currency:'EUR'},metadata:{bringnessOrderId:'order',bringnessCheckoutId:'attempt'}};
 assert.equal(matchingCheckoutPayments([match,{...match,profileId:'pfl_other'},{...match,metadata:{bringnessOrderId:'other',bringnessCheckoutId:'attempt'}}],attempt).length,1);
});

for(const terminal of [{status:'kitchen'},{status:'preparing'},{status:'ready'},{released_at:'now'},...['failed','canceled','expired'].map(provider_status=>({provider_status}))]){
 test('completed payment retry opens status: '+JSON.stringify(terminal),async()=>{
 const result=await createCenterMollieCheckout({query:async()=>({rows:[{...terminal,checkout_url:'https://www.mollie.com/checkout/old',guest_status_token:'a'.repeat(64)}]})},'attempt',env,()=>{throw Error('no provider call');});
 assert.equal(result.statusUrl,'/center/status.html#token='+'a'.repeat(64));assert.equal(result.checkoutUrl,undefined);
 });
}

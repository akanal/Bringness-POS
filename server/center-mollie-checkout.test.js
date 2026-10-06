import test from 'node:test';
import assert from 'node:assert/strict';
import {createCenterMollieCheckout} from './center-mollie-checkout.js';
const env={CENTER_PAYMENT_ORIGIN:'https://example.test'};
test('lost payment response blocks blind retries',async()=>{const r=await createCenterMollieCheckout({query:async()=>({rows:[{attempted_at:'now'}]})},'attempt',env,()=>{throw Error('must not repeat payment')});assert.equal(r.reconciliationRequired,true);});
test('completed creation reuses checkout URL',async()=>{const r=await createCenterMollieCheckout({query:async()=>({rows:[{checkout_url:'https://www.mollie.com/checkout/test'}]})},'attempt',env);assert.equal(r.alreadyCreated,true);});
test('unverified merchant cannot create checkout',async()=>assert.rejects(createCenterMollieCheckout({query:async()=>({rows:[{status:'payment_pending',active:true,contract_status:'signed',payment_status:'pending'}]})},'attempt',env),/CHECKOUT_NOT_READY/));

import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverGuestPayment} from './center-payment-recovery.js';
const token='a'.repeat(64),env={CENTER_CHECKOUT_ENABLED:'true'};
test('payment recovery remains disabled with rollout and rejects invalid capabilities',async()=>{
 const pool={query(){throw Error('must not query');}};
 assert.equal((await recoverGuestPayment(pool,token,()=>{},{})).checked,false);
 assert.equal((await recoverGuestPayment(pool,'bad',()=>{},env)).checked,false);
});
test('recovery uses durable rate limiting and server-bound payment identity',async()=>{
 let verified;
 const result=await recoverGuestPayment({query:async(sql,args)=>{
  assert.match(sql,/30 seconds/);assert.match(sql,/o.status='payment_pending'/);assert.match(sql,/cp.released_at IS NULL/);assert.match(sql,/24 hours/);assert.deepEqual(args,[token]);return {rows:[{payment_id:'tr_bound'}]};
 }},token,async id=>{verified=id;},env);
 assert.equal(result.checked,true);assert.equal(verified,'tr_bound');
});
test('no matching or already claimed payment does not call the provider',async()=>{
 assert.equal((await recoverGuestPayment({query:async()=>({rows:[]})},token,()=>{throw Error('no read');},env)).checked,false);
});
test('provider outage keeps the status route usable without exposing provider errors',async()=>{
 const result=await recoverGuestPayment({query:async()=>({rows:[{payment_id:'tr_bound'}]})},token,()=>{throw Error('secret provider response');},env);
 assert.deepEqual(result,{checked:true,unavailable:true});
});

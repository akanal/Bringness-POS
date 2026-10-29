import test from 'node:test';
import assert from 'node:assert/strict';
import {applyShopPaymentEvent as apply} from './shop-payment-ledger.js';
const initial=()=>({amountCents:1000,events:[],status:'unpaid'});
test('verified payment event is applied once; conflicting replay rejected',()=>{
 const event={id:'provider-payment-1',kind:'paid',amountCents:1000,verified:true};
 const first=apply(initial(),event);assert.equal(first.snapshot.status,'paid');assert.equal(first.replay,false);
 const replay=apply(first.snapshot,event);assert.equal(replay.replay,true);assert.equal(replay.snapshot,first.snapshot);
 assert.throws(()=>apply(first.snapshot,{...event,amountCents:900}),/EVENT_CONFLICT/);
 assert.throws(()=>apply(first.snapshot,{...event,id:'second-charge'}),/AMOUNT_MISMATCH/);
});
test('partial refunds never exceed original verified payment',()=>{
 const paid=apply(initial(),{id:'payment',kind:'paid',amountCents:1000,verified:true}).snapshot;
 const partial=apply(paid,{id:'refund-1',kind:'refund',amountCents:300,verified:true}).snapshot;
 assert.equal(partial.status,'partially_refunded');
 assert.throws(()=>apply(partial,{id:'refund-over',kind:'refund',amountCents:701,verified:true}),/EXCEEDS_PAID/);
 const complete=apply(partial,{id:'refund-2',kind:'refund',amountCents:700,verified:true}).snapshot;
 assert.equal(complete.status,'refunded');
 assert.throws(()=>apply(complete,{id:'refund-3',kind:'refund',amountCents:1,verified:true}),/EXCEEDS_PAID/);
});
test('unverified, incorrect, and out-of-order events are rejected',()=>{
 assert.throws(()=>apply(initial(),{id:'p',kind:'paid',amountCents:1000,verified:false}),/UNVERIFIED/);
 assert.throws(()=>apply(initial(),{id:'p',kind:'paid',amountCents:999,verified:true}),/AMOUNT_MISMATCH/);
 assert.throws(()=>apply(initial(),{id:'r',kind:'refund',amountCents:100,verified:true}),/EXCEEDS_PAID/);
 assert.throws(()=>apply(initial(),{id:'p',kind:'paid',amountCents:0,verified:true}),/AMOUNT_INVALID/);
});

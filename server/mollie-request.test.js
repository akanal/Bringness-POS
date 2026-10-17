import {test} from 'node:test';import assert from 'node:assert/strict';import {mollieFetch} from './mollie-request.js';
test('Mollie platform requests enforce fixed origin, redirect refusal, timeout and response bound',async()=>{
 let calls=0;const fetcher=async(url,o)=>{calls++;assert.equal(o.redirect,'error');assert(o.signal instanceof AbortSignal);return new Response('{"id":"tr_1"}');};
 assert.equal((await (await mollieFetch('https://api.mollie.com/v2/payments/tr_1',{},fetcher)).json()).id,'tr_1');
 await assert.rejects(mollieFetch('https://other.test/v2/payments',{},fetcher));assert.equal(calls,1);
 await assert.rejects(mollieFetch('https://api.mollie.com/v2/payments',{},async()=>new Response('x'.repeat(1024*1024+1))));
});

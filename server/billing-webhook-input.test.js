import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {billingWebhookId} from './billing-webhook-input.js';
test('billing webhook accepts one bounded payment ID and rejects ambiguity or invalid bytes',async()=>{
 assert.equal(await billingWebhookId(Readable.from(['id=tr_123'])),'tr_123');
 for(const raw of ['','id=../x','id=tr_1&id=tr_2',Buffer.from([0xff])])await assert.rejects(billingWebhookId(Readable.from([raw])),e=>e.status===400);
 await assert.rejects(billingWebhookId(Readable.from(['id=tr_'+ 'x'.repeat(1024)])),e=>e.status===413);
});

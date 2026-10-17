import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./ai-collection.js',import.meta.url),'utf8');
test('monthly commission job conflict target matches declared unique supplier-month constraint',()=>{
 assert.match(source,/UNIQUE\(supplier_id,month\)/);
 assert.match(source,/ON CONFLICT\(supplier_id,month\) DO UPDATE SET net_cents/);
 assert.doesNotMatch(source,/ON CONFLICT\(supplier_id,month\) WHERE kind=/);
});
test('commission jobs remain draft-only updates and exclude paid orders',()=>{
 assert.match(source,/p\.order_id IS NULL/);
 assert.match(source,/ai_collection_jobs\.state='draft'/);
});

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

test('collection validation enforces the Berlin accounting month before charging',()=>{
 const validation=readFileSync(new URL('./ai-billing-validation.js',import.meta.url),'utf8');
 assert.match(validation,/to_char\(o\.received_at AT TIME ZONE 'Europe\/Berlin','YYYY-MM'\)=\$3/);
 assert.match(validation,/\[j\.order_ids,j\.supplier_id,j\.month\]/);
});

test('duplicate and empty commission order references are rejected before querying',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const base={kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200};
 const db={query:()=>{throw Error('Database must not be called for invalid order references')}};
 await assert.rejects(validateBillingJob(db,{...base,order_ids:[]}),/fehlen oder sind doppelt/);
 await assert.rejects(validateBillingJob(db,{...base,order_ids:[id,id]}),/fehlen oder sind doppelt/);
});

test('nonpositive commission amounts cannot pass debit validation',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const job={kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200};
 const db={query:async()=>({rows:[{id,commission_cents:0,paid:null}]})};
 await assert.rejects(validateBillingJob(db,job),/Ungültige Provisionsbeträge/);
 await assert.rejects(validateBillingJob(db,{...job,net_cents:0}),/Ungültige Provisionsbeträge/);
});

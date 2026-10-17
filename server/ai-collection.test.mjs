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

test('invalid billing month is rejected before any database query',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const db={query:()=>{throw Error('Invalid period must not query database')}};
 for(const month of ['2026-00','2026-13','2026-9','invalid']){
  await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[id],supplier_id:id,month,net_cents:200}),/Ungültiger Abrechnungsmonat/);
 }
});

test('invalid supplier identity cannot reach collection database',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const db={query:()=>{throw Error('Invalid supplier must not query database')}};
 const id='11111111-1111-4111-8111-111111111111';
 for(const supplier_id of ['',null,'not-a-uuid']){
  await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[id],supplier_id,month:'2026-09',net_cents:200}),/Ungültiger Lieferant/);
 }
});

test('invalid commission order references are rejected before querying',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const db={query:()=>{throw Error('Invalid order must not query database')}};
 for(const orderId of ['',null,'not-a-uuid']){
  await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[orderId],supplier_id:id,month:'2026-09',net_cents:200}),/Ungültige Bestellreferenz/);
 }
});

test('unexpected order rows cannot pass commission debit validation',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const other='22222222-2222-4222-8222-222222222222';
 const job={kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200};
 const db={query:async()=>({rows:[{id:other,commission_cents:200,paid:null}]})};
 await assert.rejects(validateBillingJob(db,job),/Fremde Abrechnungsposition/);
});

test('duplicate database rows cannot inflate commission collection',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const job={kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:400};
 const db={query:async()=>({rows:[{id,commission_cents:200,paid:null},{id,commission_cents:200,paid:null}]})};
 await assert.rejects(validateBillingJob(db,job),/Fremde Abrechnungsposition/);
});

test('unsafe aggregate commission amounts are rejected',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const db={query:async()=>({rows:[{id:a,commission_cents:Number.MAX_SAFE_INTEGER,paid:null},{id:b,commission_cents:1,paid:null}]})};
 await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[a,b],supplier_id:a,month:'2026-09',net_cents:200}),/Ungültige Provisionsbeträge|Abrechnungsbetrag verändert/);
});

test('unknown billing job kinds cannot be debited',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const db={query:()=>{throw Error('Unknown kind must not query')}};
 await assert.rejects(validateBillingJob(db,{kind:'other'}),/Unbekannte Abrechnungsart/);
 await assert.rejects(validateBillingJob(db,null),/Unbekannte Abrechnungsart/);
});
test('invalid subscription dates and amounts cannot be debited',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const base={kind:'subscription',id:'job',source_id:'charge',order_ids:[],net_cents:200,period_start:'2026-09-01',period_end:'2026-10-01'};
 const charge={net_cents:200,starts_at:'2026-09-01',ends_at:'2026-10-01',snapshot:{}};
 const db={query:async()=>({rows:[charge]})};
 for(const changes of [{net_cents:0},{net_cents:Number.MAX_SAFE_INTEGER+1},{period_start:'bad'},{period_end:'2026-08-01'},{order_ids:null}]){
  await assert.rejects(validateBillingJob(db,{...base,...changes}),/Abo-Abrechnungsposition/);
 }
});

test('paid reconciliation rejects missing or invalid orders before payment records',()=>{
 assert.match(source,/if\(!o\|\|!Number\.isSafeInteger\(Number\(o\.commission_cents\)\)\|\|Number\(o\.commission_cents\)<=0\)fail\('Bestellung für Zahlungsabgleich fehlt oder ist ungültig'/);
 assert.match(source,/SELECT 1 FROM ai_commission_payments WHERE order_id=\$1/);
});

test('commission monetary amounts must be canonical integer cents',async()=>{
 const {validateBillingJob}=await import('./ai-billing-validation.js');
 const id='11111111-1111-4111-8111-111111111111';
 const base={kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200};
 for(const bad of ['2e2','200.0',' 200',200.5,Infinity,null]){
  const db={query:async()=>({rows:[{id,commission_cents:bad,paid:null}]})};
  await assert.rejects(validateBillingJob(db,base),/Ungültige Provisionsbeträge/);
  const validDb={query:async()=>({rows:[{id,commission_cents:200,paid:null}]})};
  await assert.rejects(validateBillingJob(validDb,{...base,net_cents:bad}),/Ungültige Provisionsbeträge/);
 }
});

test('previously paid commission order is rejected',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const id='11111111-1111-4111-8111-111111111111';const db={query:async()=>({rows:[{id,commission_cents:200,paid:id}]})};await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200}),/Abrechnungsbetrag verändert/);});

test('missing commission order rows cannot be collected',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const id='11111111-1111-4111-8111-111111111111';const db={query:async()=>({rows:[]})};await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200}),/Abrechnungsbetrag verändert/);});

test('changed commission amount cannot be debited',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const id='11111111-1111-4111-8111-111111111111';const db={query:async()=>({rows:[{id,commission_cents:199,paid:null}]})};await assert.rejects(validateBillingJob(db,{kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:200}),/Abrechnungsbetrag verändert/);});

test('valid commission batch passes with correct amount',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const id='11111111-1111-4111-8111-111111111111';const row={id,commission_cents:'200',paid:null};const db={query:async()=>({rows:[row]})};const result=await validateBillingJob(db,{kind:'commission',order_ids:[id],supplier_id:id,month:'2026-09',net_cents:'200'});assert.deepEqual(result,{orders:[row],subscription:null});});

test('valid subscription charge passes with matching period',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const snapshot={plan:'standard'};const db={query:async()=>({rows:[{net_cents:'200',starts_at:'2026-09-01',ends_at:'2026-10-01',snapshot}]})};const result=await validateBillingJob(db,{kind:'subscription',id:'job',source_id:'charge',order_ids:[],net_cents:'200',period_start:'2026-09-01',period_end:'2026-10-01'});assert.deepEqual(result,{orders:[],subscription:snapshot});});

test('missing subscription charge cannot be debited',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const db={query:async()=>({rows:[]})};await assert.rejects(validateBillingJob(db,{kind:'subscription',id:'job',source_id:'charge',order_ids:[],net_cents:200,period_start:'2026-09-01',period_end:'2026-10-01'}),/Abo-Abrechnungsposition/);});

test('subscription source charge amount mismatch is rejected',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const db={query:async()=>({rows:[{net_cents:199,starts_at:'2026-09-01',ends_at:'2026-10-01',snapshot:{}}]})};await assert.rejects(validateBillingJob(db,{kind:'subscription',id:'job',source_id:'charge',order_ids:[],net_cents:200,period_start:'2026-09-01',period_end:'2026-10-01'}),/Abo-Abrechnungsposition/);});

test('subscription charge period mismatch is rejected',async()=>{const {validateBillingJob}=await import('./ai-billing-validation.js');const db={query:async()=>({rows:[{net_cents:200,starts_at:'2026-08-01',ends_at:'2026-10-01',snapshot:{}}]})};await assert.rejects(validateBillingJob(db,{kind:'subscription',id:'job',source_id:'charge',order_ids:[],net_cents:200,period_start:'2026-09-01',period_end:'2026-10-01'}),/Abo-Abrechnungsposition/);});

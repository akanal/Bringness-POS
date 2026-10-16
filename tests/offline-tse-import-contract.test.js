import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyTseRecovery} from '../server/tse-recovery.js';

const source = await readFile(new URL('../server/tse-integration.js',import.meta.url),'utf8');
const importer = await readFile(new URL('../server/offline-sales.js',import.meta.url),'utf8');

test('Offline cloud import inserts the receipt after items and payment in one transaction',()=>{
 const start=importer.indexOf("await c.query('BEGIN')");
 const items=importer.indexOf("INSERT INTO order_items");
 const payment=importer.indexOf("INSERT INTO payments");
 const receipt=importer.indexOf("INSERT INTO receipts");
 const commit=importer.indexOf("await c.query('COMMIT');return {id:order.id");
 assert.ok(start>=0 && start<items && items<payment && payment<receipt && receipt<commit);
 assert.match(importer,/await c\.query\('ROLLBACK'\)/);
});

test('Receipt insertion prepares TSE with original offline payment, items and timestamps',()=>{
 assert.match(source,/CREATE TRIGGER receipts_prepare_tse_transaction/);
 assert.match(source,/AFTER INSERT ON receipts/);
 assert.match(source,/FROM order_items WHERE order_id=NEW\.order_id/);
 assert.match(source,/FROM payments WHERE order_id=NEW\.order_id/);
 assert.match(source,/'startedAt',v_order_created/);
 assert.match(source,/'closedAt',COALESCE\(v_order_closed,now\(\)\)/);
 assert.match(source,/fiscal_status='prepared'/);
});

test('Uncertain TSE hardware result requires manual review, not automatic replay',()=>{
 const result=classifyTseRecovery({state:'finishing',updated_at:'2026-10-16T08:00:00Z'},new Date('2026-10-16T08:20:00Z'));
 assert.equal(result.action,'manual_review');
 assert.equal(classifyTseRecovery({state:'needs_review'}).action,'manual_review');
});

test('Fiscal status API does not claim production signing or DSFinV-K export',()=>{
 assert.match(source,/salesSigningActive:false/);
 assert.match(source,/dsfinvkExportAvailable:false/);
});

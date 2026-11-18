import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const window={};vm.runInNewContext(await readFile(new URL('../apps/web/public/pos/accounting-export.js',import.meta.url),'utf8'),{window});
test('accounting positions preserve stored discounted and negative amounts without inventing tax amounts',()=>{
 const csv=window.bnAccountingExports.positions([{receipt_number:' =unsafe',issued_at:'2026-01-01T12:00:00Z',items:[{name:' @name',quantity:'2',unitPriceCents:250,discountCents:25,lineTotalCents:475,taxRate:'19'},{name:'Storno',quantity:'1',unitPriceCents:-100,discountCents:0,lineTotalCents:-100,taxRate:'7'}]}]);
 assert(csv.startsWith('\ufeff'));assert(csv.includes('"\' =unsafe"'));assert(csv.includes('"\' @name"'));assert(csv.includes('"4,75"'));assert(csv.includes('"\'-1,00"'));assert(!csv.includes('Netto'));
 assert.throws(()=>window.bnAccountingExports.positions([{items:[{quantity:1,taxRate:19,unitPriceCents:1.25}]}]),/Centbetrag/);
 assert.throws(()=>window.bnAccountingExports.positions([{}]),/vollständigen/);
});
test('cash CSV preserves counted cash and difference and neutralizes spreadsheet formulas',()=>{
 const row={id:'fixture',opened_at:'2026-01-01T10:00:00Z',closed_at:'2026-01-01T12:00:00Z',openingCents:10000,expectedCents:12000,countedCents:11975,differenceCents:-25,payments:[{method:'cash',mode:'retail',amount_cents:2000}],reason:'\t=unsafe'};
 const csv=window.bnAccountingExports.closings([row]);assert(csv.includes('"119,75"'));assert(csv.includes('"\'-0,25"'));assert(csv.includes('"\'\t=unsafe"'));assert(csv.includes('cash / retail: 20,00'));
 assert.throws(()=>window.bnAccountingExports.closings([{...row,countedCents:NaN}]),/Centbetrag/);
});

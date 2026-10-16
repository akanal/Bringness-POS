import test from 'node:test';
import assert from 'node:assert/strict';
import {groupVat,buildFiscalTransaction,receiptTseSnapshot,createUnconfiguredTseAdapter} from '../server/tse-core.js';

test('TSE VAT grouping keeps gross, net and tax totals consistent',()=>{
 const rows=groupVat([
  {quantity:2,unitPriceCents:119,taxRate:19},
  {quantity:1,unitPriceCents:107,taxRate:7},
  {quantity:1,unitPriceCents:119,taxRate:19}
 ]);
 assert.deepEqual(rows.map(x=>x.rate),[7,19]);
 assert.equal(rows.reduce((sum,x)=>sum+x.grossCents,0),464);
 for(const row of rows)assert.equal(row.netCents+row.taxCents,row.grossCents);
});
test('fiscal payload identifies matching order and payment totals',()=>{
 const tx=buildFiscalTransaction({
  restaurantId:'restaurant-1',order:{id:'order-1',totalCents:500},
  receipt:{id:'receipt-1',receiptNumber:'B-1'},
  items:[{name:'Kaffee',quantity:2,unitPriceCents:250,taxRate:19}],
  payments:[{method:'cash',amountCents:500}]
 });
 assert.equal(tx.totalsMatch,true);
 assert.equal(tx.totalCents,500);
 assert.equal(tx.paymentTotalCents,500);
 assert.equal(tx.processType,'Kassenbeleg-V1');
 assert.match(tx.clientTransactionId,/^BN-TSE-/);
});
test('fiscal payload flags payment mismatch',()=>{
 const tx=buildFiscalTransaction({
  restaurantId:'restaurant-1',order:{id:'order-1',totalCents:500},
  receipt:{receiptNumber:'B-1'},payments:[{method:'cash',amountCents:400}]
 });
 assert.equal(tx.totalsMatch,false);
});
test('fiscal payload requires restaurant, order and receipt references',()=>{
 const base={restaurantId:'r',order:{id:'o'},receipt:{id:'receipt'}};
 assert.throws(()=>buildFiscalTransaction({...base,restaurantId:null}),/restaurantId/);
 assert.throws(()=>buildFiscalTransaction({...base,order:{}}),/order.id/);
 assert.throws(()=>buildFiscalTransaction({...base,receipt:{}}),/Belegreferenz/);
});
test('TSE receipt details are visible only for signed transactions',()=>{
 assert.equal(receiptTseSnapshot(null),null);
 assert.equal(receiptTseSnapshot({state:'prepared'}),null);
 assert.deepEqual(receiptTseSnapshot({state:'signed',tse_transaction_number:'42',signature:'sig'}).transactionNumber,'42');
});
test('unconfigured TSE cannot start or finish fiscal transactions',async()=>{
 const adapter=createUnconfiguredTseAdapter();
 assert.equal((await adapter.status()).certified,false);
 await assert.rejects(()=>adapter.startTransaction({}),{code:'TSE_NOT_CONFIGURED'});
 await assert.rejects(()=>adapter.finishTransaction({}),{code:'TSE_NOT_CONFIGURED'});
});

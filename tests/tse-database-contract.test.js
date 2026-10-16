import test from 'node:test';
import assert from 'node:assert/strict';
import {markTransactionSigned,receiptTseSnapshot} from '../server/tse-core.js';

test('TSE state transition is guarded and parameterized',async()=>{
 let statement,values;
 const db={query:async(sql,params)=>{statement=sql;values=params;return {rows:[]}}};
 const result=await markTransactionSigned(db,'tx-123',{
  transactionNumber:'42',serialNumber:'serial',signatureCounter:'1',
  signatureAlgorithm:'ecdsa',signature:'sig',finishedAt:'2026-10-16T08:00:00Z'
 });
 assert.equal(result,null);
 assert.match(statement,/WHERE id=\$1 AND state='finishing' RETURNING \*/);
 assert.equal(values[0],'tx-123');
 assert.equal(values[1],'42');
 assert.equal(values[2],'serial');
});

test('no fiscal snapshot exists for rejected or unsigned transition',()=>{
 assert.equal(receiptTseSnapshot(null),null);
 assert.equal(receiptTseSnapshot({state:'needs_review'}),null);
 assert.equal(receiptTseSnapshot({state:'finishing'}),null);
});

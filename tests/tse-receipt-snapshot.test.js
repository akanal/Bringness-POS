import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptTseSnapshot} from '../server/tse-core.js';

test('unsigned and unresolved TSE transactions never expose signed receipt data',()=>{
 for(const state of ['prepared','starting','started','finishing','needs_review','failed']){
  assert.equal(receiptTseSnapshot({state,signature:'not-final'}),null);
 }
 assert.equal(receiptTseSnapshot(null),null);
});

test('signed TSE snapshot retains fiscal receipt fields',()=>{
 const transaction={
  state:'signed',tse_transaction_number:'18',tse_serial_number:'TSE-123',
  signature_counter:'19',signature_algorithm:'ecdsa',
  log_time_format:'unixTime',started_at:'2026-10-16T07:00:00Z',
  finished_at:'2026-10-16T07:01:00Z',signature:'signature-value',
  public_key:'public-key-value'
 };
 assert.deepEqual(receiptTseSnapshot(transaction),{
  transactionNumber:'18',serialNumber:'TSE-123',signatureCounter:'19',
  signatureAlgorithm:'ecdsa',logTimeFormat:'unixTime',
  startedAt:'2026-10-16T07:00:00Z',finishedAt:'2026-10-16T07:01:00Z',
  signature:'signature-value',publicKey:'public-key-value'
 });
});

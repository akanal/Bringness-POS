import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptUrl} from '../server/public-receipt.js';

const token='11111111-1111-4111-8111-111111111111';
test('receipt URL uses configured public HTTPS origin, not untrusted Host',()=>{
 const oldOrigin=process.env.PUBLIC_RECEIPT_ORIGIN,oldBase=process.env.PUBLIC_BASE_URL;
 try{
  process.env.PUBLIC_RECEIPT_ORIGIN='https://pos.example.test';
  delete process.env.PUBLIC_BASE_URL;
  assert.equal(receiptUrl({headers:{host:'attacker.example'}},token),'https://pos.example.test/beleg/'+token);
 }finally{
  if(oldOrigin===undefined)delete process.env.PUBLIC_RECEIPT_ORIGIN;else process.env.PUBLIC_RECEIPT_ORIGIN=oldOrigin;
  if(oldBase===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=oldBase;
 }
});
test('receipt URL rejects invalid token',()=>{
 assert.throws(()=>receiptUrl({headers:{host:'pos.example.test'}},'../admin'),/Ungültiger Beleglink/);
});

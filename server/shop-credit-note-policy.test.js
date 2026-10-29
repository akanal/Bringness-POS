import test from 'node:test';
import assert from 'node:assert/strict';
import {assessShopCreditNote} from './shop-credit-note-policy.js';
const snapshot={amountCents:1000,events:[{id:'tr_1',kind:'paid',amountCents:1000},{id:'re_1',kind:'refund',amountCents:300}],status:'partially_refunded'};
const base={snapshot,refundId:'re_1',amountCents:300,originalInvoiceId:'INV-2026-1'};
test('recorded partial refund is eligible for a credit note draft',()=>{
 assert.deepEqual(assessShopCreditNote(base),{refundId:'re_1',originalInvoiceId:'INV-2026-1',amountCents:300,currency:'EUR',eligible:true});
});
test('no credit note without matching recorded refund',()=>{
 for(const changes of [{refundId:'re_2'},{amountCents:301},{originalInvoiceId:''},{refundId:'tr_1'},{snapshot:{...snapshot,events:[snapshot.events[0]]}}]){
  assert.throws(()=>assessShopCreditNote({...base,...changes}),/CREDIT_NOTE_/);
 }
});
test('rejects inconsistent payment ledger and duplicate refund records',()=>{
 for(const events of [
  [...snapshot.events,snapshot.events[1]],
  [{id:'tr_1',kind:'paid',amountCents:500},snapshot.events[1]],
  [{id:'tr_1',kind:'paid',amountCents:1000},{id:'re_1',kind:'refund',amountCents:1100}]
 ])assert.throws(()=>assessShopCreditNote({...base,snapshot:{...snapshot,events}}),/CREDIT_NOTE_/);
});

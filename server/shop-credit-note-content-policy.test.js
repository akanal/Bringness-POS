import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShopCreditNoteContent} from './shop-credit-note-content-policy.js';
const snapshot={amountCents:1190,events:[{id:'tr_1',kind:'paid',amountCents:1190},{id:'re_1',kind:'refund',amountCents:300}]};
const originalInvoice={id:'invoice-1',totalCents:1190};
const creditNote={originalInvoiceId:'invoice-1',refundId:'re_1',currency:'EUR',amountCents:300,reason:'Returned item',issueDate:'2026-10-29'};
const base={snapshot,refundId:'re_1',amountCents:300,originalInvoice,creditNote};
test('accepts a credit note draft matching the recorded refund',()=>{
 assert.equal(validateShopCreditNoteContent(base).eligible,true);
});
test('rejects invalid reference, amount, reason, date and unrecorded refund',()=>{
 for(const changes of [
  {creditNote:{...creditNote,originalInvoiceId:'other'}},
  {creditNote:{...creditNote,amountCents:299}},
  {creditNote:{...creditNote,reason:''}},
  {creditNote:{...creditNote,issueDate:'2026-02-30'}},
  {refundId:'re_2'},
  {originalInvoice:{...originalInvoice,totalCents:100}}
 ])assert.throws(()=>validateShopCreditNoteContent({...base,...changes}),/(SHOP_CREDIT_NOTE_|CREDIT_NOTE_)/);
});

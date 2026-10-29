import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShopDocumentNumber} from './shop-document-number-policy.js';
const base={companyId:'company-1',kind:'invoice',year:2026,sequence:1,documentNumber:'INV-2026-000000001'};
test('accepts canonical invoice and credit note numbers',()=>{
 assert.deepEqual(validateShopDocumentNumber(base),base);
 assert.equal(validateShopDocumentNumber({...base,kind:'credit_note',documentNumber:'CRN-2026-000000001'}).kind,'credit_note');
});
test('rejects invalid year, sequence, kind, company and number',()=>{
 for(const changes of [{companyId:''},{kind:'other'},{year:1999},{sequence:0},{sequence:1.5},{documentNumber:'INV-2026-1'},{documentNumber:'CRN-2026-000000001'}]){
  assert.throws(()=>validateShopDocumentNumber({...base,...changes}),/SHOP_DOCUMENT_/);
 }
});

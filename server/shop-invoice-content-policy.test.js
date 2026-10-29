import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShopInvoiceContent} from './shop-invoice-content-policy.js';
const base={sellerName:'Example GmbH',sellerAddress:'Berlin',buyerName:'Customer',buyerAddress:'Hamburg',sellerTaxId:'DE123456789',description:'Goods',issueDate:'2026-10-29',serviceDate:'2026-10-29',taxLines:[{netCents:1000,taxCents:190,taxRate:19}],totalCents:1190};
test('validates consistent draft invoice totals',()=>assert.deepEqual(validateShopInvoiceContent(base),{totalCents:1190,netCents:1000,taxCents:190,currency:'EUR'}));
test('rejects missing mandatory content, invalid dates and incorrect totals',()=>{
 for(const changes of [{sellerName:''},{sellerTaxId:''},{issueDate:'2026-02-30'},{taxLines:[]},{taxLines:[{netCents:1000,taxCents:90,taxRate:19}]},{totalCents:1191},{totalCents:0}]){
  assert.throws(()=>validateShopInvoiceContent({...base,...changes}),/SHOP_INVOICE_/);
 }
});
test('rejects unsafe amounts and unsupported rates',()=>{
 for(const taxLines of [[{netCents:1.5,taxCents:0,taxRate:0}],[{netCents:100,taxCents:20,taxRate:20}],[{netCents:Number.MAX_SAFE_INTEGER,taxCents:0,taxRate:0},{netCents:1,taxCents:0,taxRate:0}]]){
  assert.throws(()=>validateShopInvoiceContent({...base,taxLines}),/SHOP_INVOICE_/);
 }
});

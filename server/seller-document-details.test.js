import {test} from 'node:test';import assert from 'node:assert/strict';import {sellerDocumentDetails} from './seller-document-details.js';
test('seller footer accepts optional fields and normalizes valid bank references',()=>{
 const d=sellerDocumentDetails({iban:'de89 3704 0044 0532 0130 00',bic:'cobadeffxxx',taxNumber:'12/345/67890'});assert.equal(d.iban,'DE89370400440532013000');assert.equal(d.bic,'COBADEFFXXX');assert.equal(d.email,'');assert.equal(sellerDocumentDetails({}).bankName,'');
});
test('seller footer rejects incorrect bank references, markup controls and invalid contact fields',()=>{
 for(const value of [{iban:'DE00370400440532013000'},{bic:'INVALID'},{email:'missing-at'},{phone:'abc\nInjected'},{bankName:[]},null])assert.throws(()=>sellerDocumentDetails(value));
});

test('seller footer writes fail closed after role revocation and on missing billing address',async()=>{
 const {saveSellerDocumentDetails}=await import('./seller-document-details.js');
 for(const active of [false,true]){const calls=[];let released=false;const pool={connect:async()=>({release(){released=true},query:async sql=>{calls.push(sql);return {rowCount:sql.includes('FROM users')&&active?1:0,rows:[]};}})};
 await assert.rejects(saveSellerDocumentDetails(pool,{id:'actor',company_id:'company'},{}),e=>e.status===(active?409:403));assert.equal(calls.at(-1),'ROLLBACK');assert(released);if(!active)assert(!calls.some(q=>q.startsWith('UPDATE')));
 }
});

test('BIC distinguishes bank sort codes and accepts an empty optional field',()=>{
 assert.throws(()=>sellerDocumentDetails({bic:'500 105 17'}),/BIC-Feld steht eine Bankleitzahl/);
 assert.equal(sellerDocumentDetails({bic:'coba deff xxx'}).bic,'COBADEFFXXX');
 assert.equal(sellerDocumentDetails({iban:'DE89370400440532013000',bic:''}).bic,'');
});

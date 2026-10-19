import {groupVat} from './tse-core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {depositRule,depositQuote} from './pos-deposit.js';
const id='11111111-1111-4111-8111-111111111111',valid={productId:id,amountCents:25,units:24,label:'Flasche',taxRate:19};
test('deposit configuration requires exact cents, bounded units and explicit tax',()=>{assert.equal(depositRule(valid).amountCents,25);for(const b of [{amountCents:-1},{amountCents:0.25},{units:1000},{taxRate:undefined},{label:'x\n'}])assert.throws(()=>depositRule({...valid,...b}));assert.equal(depositRule({...valid,amountCents:0}).amountCents,0)});
test('crate deposits multiply independently from merchandise discounts',()=>{assert.deepEqual(depositQuote([{product_id:id,amount_cents:25,units:24,label:'Flasche',tax_rate:'19'}],[{productId:id,qty:1000}]),[{productId:id,label:'Flasche',unitCents:25,taxRate:19,qty:24000,totalCents:600000}]);assert.equal(depositQuote([],[{productId:id,qty:2}]).length,0)});
test('deposit quote refuses overflow and unsupported quantity',()=>{assert.throws(()=>depositQuote([{product_id:id,amount_cents:1000000,units:999,label:'Kasten',tax_rate:19}],[{productId:id,qty:999999}]));});

test('prepared fiscal VAT accepts negative return lines without a second discount',()=>{assert.equal(groupVat([{quantity:24,unitPriceCents:-25,taxRate:19}])[0].grossCents,-600);assert.throws(()=>groupVat([{quantity:24,unitPriceCents:-25,taxRate:19,discountCents:1}]));});

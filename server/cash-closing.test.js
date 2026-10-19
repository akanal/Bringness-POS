import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {cashRequest,cashTotals} from './cash-closing.js';
const draft=()=>({restaurantId:crypto.randomUUID(),requestKey:crypto.randomUUID(),action:'open',amountCents:0});
test('cash amounts reject fractions, negatives and missing movement reasons',()=>{for(const amountCents of [-1,0.1,NaN,100000001])assert.throws(()=>cashRequest({...draft(),amountCents}));assert.equal(cashRequest(draft()).amountCents,0);assert.throws(()=>cashRequest({...draft(),action:'deposit',amountCents:100,sessionId:crypto.randomUUID()}));});
test('cash totals exclude card sales and include both business modes',()=>{assert.equal(cashTotals(1000,[{action:'deposit',amount_cents:500},{action:'withdraw',amount_cents:200}],[{method:'cash',mode:'retail',amount_cents:'123'},{method:'cash',mode:'trade',amount_cents:'456'},{method:'card',amount_cents:'10000'}]).expectedCents,1879);});

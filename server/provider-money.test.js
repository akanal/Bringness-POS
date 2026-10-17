import {test} from 'node:test';import assert from 'node:assert/strict';import {providerEuroCents} from './provider-money.js';
test('provider euro parsing preserves exact cents up to safe integer boundary',()=>{
 assert.equal(providerEuroCents({currency:'EUR',value:'90071992547409.91'}),Number.MAX_SAFE_INTEGER);
 for(const value of ['90071992547409.92','1e2',' 1.00','1.001','-1.00','Infinity',1,null])assert.throws(()=>providerEuroCents({currency:'EUR',value}));
 assert.throws(()=>providerEuroCents({currency:'USD',value:'1.00'}));assert.equal(providerEuroCents({currency:'EUR',value:'0.00'}),0);
});

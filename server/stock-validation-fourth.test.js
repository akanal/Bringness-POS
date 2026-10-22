import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleTransition,aggregateIngredients} from './ai-stock-lifecycle-core.js';
import {kitchenAction} from './ai-stock-lifecycle.js';
const noPool={connect(){throw Error('Unexpected database connection')}};
const owner={id:'owner',role:'restaurant'};
const base={requestKey:'11111111-1111-4111-8111-111111111111',locationId:'22222222-2222-4222-8222-222222222222',orderId:'fixture',action:'start'};
const invalid=b=>assert.rejects(kitchenAction(noPool,owner,b),e=>e.status===400);

test('transitions reject inherited state and action names',()=>{for(const [s,a] of [['accepted','constructor'],['accepted','toString'],['constructor','start'],['__proto__','toString']])assert.throws(()=>lifecycleTransition(s,a),e=>e.status===409);assert.equal(lifecycleTransition('accepted','start'),'preparing')});

test('kitchen actions reject nonobject bodies before connecting',async()=>{for(const b of [null,undefined,[],true,'body'])await invalid(b)});

test('kitchen IDs reject object coercion',async()=>{await invalid({...base,requestKey:{toString:()=>base.requestKey}});await invalid({...base,locationId:[base.locationId]})});

test('kitchen reasons reject coerced values',async()=>{for(const reason of [true,123,{},['reason']])await invalid({...base,reason})});

test('acceptance bounds item arrays before connection',async()=>{for(const items of [undefined,{},[],Array(101).fill({})])await invalid({...base,action:'accept',items})});

test('acceptance rejects malformed item rows',async()=>{for(const item of [null,[],true,'dish'])await invalid({...base,action:'accept',items:[item]})});

test('zero dish quantities fail before database access',async()=>{await invalid({...base,action:'accept',items:[{productCode:'dish',quantity:0}]})});

test('return batches are bounded before normalization',async()=>{for(const lines of [undefined,{},[],Array(101).fill({})])await invalid({...base,action:'return',reason:'unused',confirmed:true,lines})});

test('returns reject malformed rows before connection',async()=>{for(const line of [null,[],true,'stock'])await invalid({...base,action:'return',reason:'unused',confirmed:true,lines:[line]})});

test('returns reject zero and duplicate ingredients before connecting',async()=>{const line={stockId:base.locationId,quantity:1};for(const lines of [[{...line,quantity:0}],[line,line],[line,{...line,stockId:line.stockId.toUpperCase()}]])await invalid({...base,action:'return',reason:'unused',confirmed:true,lines})});

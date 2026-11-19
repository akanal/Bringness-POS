import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supplierFulfilmentAction as action} from './ai-supplier-actions.js';
const id='aaaaaaaa-1111-4111-8111-111111111111',requestId='bbbbbbbb-1111-4111-8111-111111111111';
const group='/api/ai/v1/supplier/order-groups/'+id,order='/api/ai/v1/supplier/orders/'+id;
test('supplier group acceptance maps only an explicit valid delivery date and durable canonical request identity',()=>{
 const r=action(group+'/accept',{requestId:requestId.toUpperCase(),confirmed:true,deliveryDate:'2026-11-30'});assert.equal(r.path,'/api/ai/order-groups/'+id+'/accept');assert.equal(r.body.requestKey,requestId);assert.equal(r.special,false);
 assert.deepEqual(r,action(group+'/accept',{deliveryDate:'2026-11-30',confirmed:true,requestId}));
});
test('only supplier-owned actions are mapped; receipt, approval, stock and payments remain inaccessible',()=>{
 for(const p of [group+'/receive',order+'/receive',order+'/approve','/api/ai/fulfilment/replacement/approve','/api/ai/v1/supplier/payments',order+'/accept'])assert.equal(action(p,{}),null);
});
test('unavailable and replacement reports use existing workflows with reviewed inputs',()=>{
 const r=action(order+'/unavailable',{requestId,confirmed:true,reason:' shortage ',pauseProduct:true});assert.equal(r.body.reason,'shortage');assert.equal(r.body.orderId,id);assert.equal(r.special,true);assert.equal(r.body.pauseProduct,true);
 const p=action(order+'/replacement',{requestId,confirmed:true,reason:'Replacement',productId:requestId,packs:2});assert.equal(p.path,'/api/ai/fulfilment/replacement/propose');assert.equal(p.body.packs,2);
});
test('invalid dates, missing consent, forged actor fields, invalid flags and fractional packs are rejected',()=>{
 for(const b of [{requestId,confirmed:false,deliveryDate:'2026-11-30'},{requestId,confirmed:true,deliveryDate:'2026-02-30'},{requestId,confirmed:true,deliveryDate:'2026-11-30',actorId:id},{requestId:'bad',confirmed:true,deliveryDate:'2026-11-30'}])assert.throws(()=>action(group+'/accept',b),e=>e.status===400);
 assert.throws(()=>action(order+'/unavailable',{requestId,confirmed:true,reason:'x',pauseProduct:'true'}));
 for(const packs of [0,1.5,10001,Infinity,'1'])assert.throws(()=>action(order+'/replacement',{requestId,confirmed:true,reason:'x',productId:id,packs}));
 assert.throws(()=>action(group+'/cancel',{requestId,confirmed:true,reason:' '}));
});

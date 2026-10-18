import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {customerRecord,deliveryRequest} from './customer-delivery.js';
const recipient={name:' Buyer ',street:'Street 1',postalCode:'10115',city:'Berlin',country:'Deutschland'};
const draft=()=>({restaurantId:crypto.randomUUID(),requestKey:crypto.randomUUID(),recipient,items:[{productId:crypto.randomUUID(),qty:1500}]});
test('customer address normalization and malformed contact rejection',()=>{assert.equal(customerRecord(recipient).name,'Buyer');for(const email of [42,{},'bad','a\n@b.c'])assert.throws(()=>customerRecord({...recipient,email}));assert.throws(()=>customerRecord({...recipient,phone:'a\nb'}));assert.throws(()=>customerRecord({...recipient,city:''}));});
test('delivery quantities and identity validate without accepting client product snapshots',()=>{const d=draft();d.items[0].name='Forged';const out=deliveryRequest(d);assert.equal(out.items[0].qty,1500);assert.equal(out.items[0].name,undefined);for(const qty of [0,-1,1.5,1000000,'2'])assert.throws(()=>deliveryRequest({...d,items:[{...d.items[0],qty}]}));assert.throws(()=>deliveryRequest({...d,items:[d.items[0],d.items[0]]}));assert.throws(()=>deliveryRequest({...d,requestKey:'bad'}));assert.throws(()=>deliveryRequest({...d,note:'x'.repeat(1001)}));});

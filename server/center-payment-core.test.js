import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCenterPayment} from './center-payment-core.js';
const expected={merchantReference:'restaurant-merchant',paymentId:'payment-1',orderId:'order-1',amountCents:1250,currency:'EUR'};
const paid={...expected,status:'paid',refundedCents:0,chargedBackCents:0};
test('matching paid restaurant payment passes internal validation',()=>assert.equal(validateCenterPayment(expected,paid).release,true));
for(const [field,value] of [['merchantReference','bringness-license-account'],['paymentId','other'],['orderId','other'],['currency','USD'],['amountCents',1],['status','pending'],['status','failed'],['refundedCents',1],['chargedBackCents',1],['refundedCents',undefined]]){
 test('payment mismatch or uncertainty is blocked: '+field+'='+value,()=>assert.equal(validateCenterPayment(expected,{...paid,[field]:value}).release,false));
}
test('missing binding and invalid expected amount are blocked',()=>{assert.equal(validateCenterPayment({},paid).release,false);assert.equal(validateCenterPayment({...expected,amountCents:NaN},paid).release,false);});

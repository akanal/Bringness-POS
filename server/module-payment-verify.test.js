import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentMatchesCheckout} from './module-payment-verify.js';

const expected={paymentId:'tr_example',grossCents:8911,checkoutId:'checkout-1',companyId:'company-1'};
const payment={id:'tr_example',status:'paid',amount:{currency:'EUR',value:'89.11'},metadata:{checkoutId:'checkout-1',companyId:'company-1'}};

test('paid payment with matching gross amount and checkout binding passes',()=>{
 assert.equal(paymentMatchesCheckout(payment,expected),true);
});
test('nonpaid, mismatched or malformed payments never grant access',()=>{
 const variations=[
  {...payment,status:'open'},
  {...payment,status:'failed'},
  {...payment,id:'tr_other'},
  {...payment,amount:{currency:'USD',value:'89.11'}},
  {...payment,amount:{currency:'EUR',value:'89.10'}},
  {...payment,amount:{currency:'EUR',value:'89.110'}},
  {...payment,metadata:{checkoutId:'other',companyId:'company-1'}},
  {...payment,metadata:{checkoutId:'checkout-1',companyId:'other'}},
  {...payment,metadata:null},
  null
 ];
 for(const variant of variations)assert.equal(paymentMatchesCheckout(variant,expected),false);
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {recurringBillingSource} from './billing-recurring.js';
const company='11111111-1111-4111-8111-111111111111',source={provider_payment_id:'tr_first',currency:'EUR',amount_cents:3569,mollie_customer_id:'cst_1',mollie_subscription_id:'sub_1'},p={id:'tr_next',status:'paid',customerId:'cst_1',subscriptionId:'sub_1',metadata:{companyId:company,planCode:'pos_base_monthly'},amount:{currency:'EUR',value:'35.69'}};
test('recurring invoices require an existing paid matching subscription and retain contracted amount',async()=>{
 let reads=0;const db={query:async(sql,args)=>{reads++;assert.match(sql,/paid_at IS NOT NULL/);assert.match(sql,/FOR SHARE/);assert.equal(args[2],company);return {rows:[source]};}};
 assert.equal(await recurringBillingSource(db,p),source);assert.equal(await recurringBillingSource(db,{...p,amount:{currency:'EUR',value:'41.64'}}),null);assert.equal(await recurringBillingSource(db,{...p,metadata:{companyId:'bad'}}),null);assert.equal(reads,2);assert.equal(await recurringBillingSource({query:async()=>({rows:[]})},p),null);
});

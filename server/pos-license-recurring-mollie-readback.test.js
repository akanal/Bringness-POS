import test from "node:test";
import assert from "node:assert/strict";
import {verifyMonthlyMolliePayment} from "./pos-license-recurring-mollie-readback.js";

const payment = {id:"tr_123",mode:"test",status:"paid",customerId:"cst_123",
  subscriptionId:"sub_123",amount:{currency:"EUR",value:"35.69"},
  metadata:{bringnessCompanyId:"company1",bringnessPlanCode:"online_pos"}};
const subscription = {id:"sub_123",mode:"test",status:"active",customerId:"cst_123"};
const args = {apiKey:"test_example",paymentId:"tr_123",customerId:"cst_123",
  subscriptionId:"sub_123",companyId:"company1",planCode:"online_pos"};
const fetcherFor = (p=payment,s=subscription) => async (url,options) => {
  assert.equal(options.headers.Authorization,"Bearer test_example");
  assert.equal(options.method,"GET");
  return {ok:true,json:async()=>url.includes("/payments/")?p:s};
};
test("verified sandbox payment and subscription permit renewal decision",async()=>{
  assert.equal((await verifyMonthlyMolliePayment({...args,fetcher:fetcherFor()})).action,"renew");
});
test("live key is rejected before any API call",async()=>{
  const result=await verifyMonthlyMolliePayment({...args,apiKey:"live_example",
    fetcher:()=>{throw Error("must not fetch");}});
  assert.equal(result.reason,"sandbox_test_key_required");
});
test("mismatched Mollie payment reference cannot renew",async()=>{
  const result=await verifyMonthlyMolliePayment({...args,
    fetcher:fetcherFor({...payment,id:"tr_wrong"})});
  assert.equal(result.reason,"payment_not_verified");
});
test("mismatched subscription customer cannot renew",async()=>{
  const result=await verifyMonthlyMolliePayment({...args,
    fetcher:fetcherFor(payment,{...subscription,customerId:"cst_other"})});
  assert.equal(result.reason,"subscription_not_verified");
});
test("duplicate Mollie payment does not renew",async()=>{
  const result=await verifyMonthlyMolliePayment({...args,
    previousPaymentIds:["tr_123"],fetcher:fetcherFor()});
  assert.equal(result.action,"noop");
});

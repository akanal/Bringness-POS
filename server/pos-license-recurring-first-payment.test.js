import test from "node:test";
import assert from "node:assert/strict";
import {createSandboxFirstPayment} from "./pos-license-recurring-first-payment.js";
const base={apiKey:"test_example",companyId:"company1",planCode:"online_pos",
 customerId:"cst_123",redirectUrl:"https://sandbox.example.org/return",
 webhookUrl:"https://sandbox.example.org/webhook"};
test("first payment uses test-mode recurring mandate and gross EUR price",async()=>{
 const result=await createSandboxFirstPayment({...base,fetcher:async(url,options)=>{
   assert.equal(url,"https://api.mollie.com/v2/payments");
   const body=JSON.parse(options.body);
   assert.equal(body.sequenceType,"first");
   assert.equal(body.customerId,"cst_123");
   assert.deepEqual(body.amount,{currency:"EUR",value:"35.69"});
   return {ok:true,json:async()=>({id:"tr_123",mode:"test",customerId:"cst_123",
     _links:{checkout:{href:"https://www.mollie.com/checkout/test"}}})};
 }});
 assert.equal(result.created,true);
 assert.equal(result.paymentId,"tr_123");
});
test("production API key cannot create first payment",async()=>{
 const result=await createSandboxFirstPayment({...base,apiKey:"live_example",
 fetcher:()=>{throw Error("network must not be called");}});
 assert.equal(result.reason,"sandbox_test_key_required");
});
test("non-HTTPS callback rejected before API call",async()=>{
 const result=await createSandboxFirstPayment({...base,webhookUrl:"http://example.org/hook",
 fetcher:()=>{throw Error("network must not be called");}});
 assert.equal(result.reason,"invalid_callback_url");
});
test("wrong Mollie customer response rejected",async()=>{
 const result=await createSandboxFirstPayment({...base,fetcher:async()=>({
 ok:true,json:async()=>({id:"tr_123",mode:"test",customerId:"cst_other",
 _links:{checkout:{href:"https://www.mollie.com/checkout/test"}}})})});
 assert.equal(result.reason,"provider_response_mismatch");
});

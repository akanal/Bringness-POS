import test from "node:test";
import assert from "node:assert/strict";
import {monthlyGrossAmount,createSandboxMonthlySubscription} from "./pos-license-recurring-create.js";

test("all monthly plan prices include 19 percent VAT",()=>{
  assert.equal(monthlyGrossAmount("online_pos"),"35.69");
  assert.equal(monthlyGrossAmount("restaurant_module"),"83.29");
  assert.equal(monthlyGrossAmount("qr_module"),"35.69");
  assert.equal(monthlyGrossAmount("not_a_plan"),null);
});
test("live credentials never create a subscription",async()=>{
  const result=await createSandboxMonthlySubscription({
    apiKey:"live_example",customerId:"cst_123",companyId:"company1",
    planCode:"online_pos",webhookUrl:"https://sandbox.example.com/webhook",
    fetcher:()=>{throw Error("unexpected network call");}
  });
  assert.equal(result.reason,"sandbox_test_key_required");
});
test("valid request sends monthly gross EUR amount to Mollie",async()=>{
  const result=await createSandboxMonthlySubscription({
    apiKey:"test_example",customerId:"cst_123",companyId:"company1",
    planCode:"online_pos",webhookUrl:"https://sandbox.example.com/webhook",
    fetcher:async(url,options)=>{
      assert.equal(url,"https://api.mollie.com/v2/customers/cst_123/subscriptions");
      assert.equal(options.method,"POST");
      const body=JSON.parse(options.body);
      assert.deepEqual(body.amount,{currency:"EUR",value:"35.69"});
      assert.equal(body.interval,"1 month");
      return {ok:true,json:async()=>({id:"sub_123",customerId:"cst_123",mode:"test",status:"active"})};
    }
  });
  assert.equal(result.created,true);
});
test("insecure webhook URL is rejected before provider call",async()=>{
  const result=await createSandboxMonthlySubscription({
    apiKey:"test_example",customerId:"cst_123",companyId:"company1",
    planCode:"online_pos",webhookUrl:"http://example.com/webhook",
    fetcher:()=>{throw Error("unexpected network call");}
  });
  assert.equal(result.reason,"invalid_webhook_url");
});

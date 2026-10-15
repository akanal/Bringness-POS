import test from "node:test";
import assert from "node:assert/strict";
import {decideSandboxMandateBootstrap,verifySandboxRecurringMandate} from "./pos-license-recurring-mandate.js";
const firstPayment={verified:true,customerId:"cst_123"};
test("valid provider mandate allows subscription bootstrap",()=>{
 assert.deepEqual(decideSandboxMandateBootstrap({firstPayment,customerId:"cst_123",
 mandates:[{id:"mdt_123",status:"valid",customerId:"cst_123"}]}),
 {ready:true,mandateId:"mdt_123"});
});
test("invalid, revoked or wrong-customer mandates are rejected",()=>{
 for(const mandates of [
  [],[{id:"mdt_123",status:"invalid",customerId:"cst_123"}],
  [{id:"mdt_123",status:"valid",customerId:"cst_other"}],
  [{id:"bad",status:"valid",customerId:"cst_123"}]
 ]){
  assert.equal(decideSandboxMandateBootstrap({firstPayment,customerId:"cst_123",mandates}).ready,false);
 }
});
test("unverified first payment blocks mandate read",async()=>{
 const result=await verifySandboxRecurringMandate({
  apiKey:"test_example",customerId:"cst_123",
  firstPayment:{verified:false,customerId:"cst_123"},
  fetcher:()=>{throw Error("unexpected provider request");}
 });
 assert.equal(result.reason,"first_payment_not_verified");
});
test("test-only mandate read checks provider response",async()=>{
 const result=await verifySandboxRecurringMandate({
  apiKey:"test_example",customerId:"cst_123",firstPayment,
  fetcher:async(url,options)=>{
   assert.equal(url,"https://api.mollie.com/v2/customers/cst_123/mandates");
   assert.equal(options.method,"GET");
   return {ok:true,json:async()=>({_embedded:{mandates:[
    {id:"mdt_123",status:"valid",customerId:"cst_123"}]}})};
  }
 });
 assert.equal(result.ready,true);
});
test("live credentials are blocked",async()=>{
 const result=await verifySandboxRecurringMandate({
  apiKey:"live_example",customerId:"cst_123",firstPayment,
  fetcher:()=>{throw Error("unexpected provider request");}
 });
 assert.equal(result.reason,"sandbox_test_key_required");
});

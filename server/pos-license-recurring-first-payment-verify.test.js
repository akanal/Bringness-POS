import test from "node:test";
import assert from "node:assert/strict";
import {verifySandboxFirstPayment} from "./pos-license-recurring-first-payment-verify.js";
const expected={apiKey:"test_example",paymentId:"tr_123",customerId:"cst_123",
 companyId:"company1",planCode:"online_pos"};
const paid={id:"tr_123",mode:"test",customerId:"cst_123",sequenceType:"first",
 status:"paid",amount:{currency:"EUR",value:"35.69"},
 metadata:{bringnessCompanyId:"company1",bringnessPlanCode:"online_pos"}};
const mock=(payment)=>async(url,opts)=>{
 assert.equal(url,"https://api.mollie.com/v2/payments/tr_123");
 assert.equal(opts.method,"GET");
 return {ok:true,json:async()=>payment};
};
test("verified paid first payment passes",async()=>{
 assert.equal((await verifySandboxFirstPayment({...expected,fetcher:mock(paid)})).verified,true);
});
test("unpaid first payment never authorizes mandate",async()=>{
 for(const status of ["open","pending","failed","canceled","expired"]){
  const result=await verifySandboxFirstPayment({...expected,fetcher:mock({...paid,status})});
  assert.equal(result.verified,false);
 }
});
test("wrong company, amount, customer, or payment mode rejected",async()=>{
 for(const changed of [
  {...paid,customerId:"cst_other"},
  {...paid,mode:"live"},
  {...paid,amount:{currency:"EUR",value:"29.99"}},
  {...paid,metadata:{...paid.metadata,bringnessCompanyId:"other"}},
  {...paid,sequenceType:"recurring"}
 ]){
  assert.equal((await verifySandboxFirstPayment({...expected,fetcher:mock(changed)})).verified,false);
 }
});
test("live API key blocked before request",async()=>{
 const result=await verifySandboxFirstPayment({...expected,apiKey:"live_example",
 fetcher:()=>{throw Error("unexpected network request");}});
 assert.equal(result.reason,"sandbox_test_key_required");
});

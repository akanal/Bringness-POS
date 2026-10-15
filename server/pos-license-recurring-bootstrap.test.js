import test from "node:test";
import assert from "node:assert/strict";
import {bootstrapSandboxMonthlySubscription} from "./pos-license-recurring-bootstrap.js";
const args={apiKey:"test_example",paymentId:"tr_123",customerId:"cst_123",
 companyId:"company1",planCode:"online_pos",webhookUrl:"https://sandbox.example.org/webhook"};
const first={id:"tr_123",mode:"test",customerId:"cst_123",sequenceType:"first",
 status:"paid",amount:{currency:"EUR",value:"35.69"},
 metadata:{bringnessCompanyId:"company1",bringnessPlanCode:"online_pos"}};
test("paid first payment and valid mandate lead to subscription creation",async()=>{
 const calls=[];
 const result=await bootstrapSandboxMonthlySubscription({...args,fetcher:async(url,options)=>{
  calls.push(options.method+" "+url);
  if(url.includes("/payments/")) return {ok:true,json:async()=>first};
  if(url.endsWith("/mandates")) return {ok:true,json:async()=>({
    _embedded:{mandates:[{id:"mdt_123",customerId:"cst_123",status:"valid"}]}})};
  if(url.endsWith("/subscriptions")) return {ok:true,json:async()=>({
    id:"sub_123",customerId:"cst_123",mode:"test",status:"active"})};
  throw Error("unexpected API call");
 }});
 assert.equal(result.created,true);
 assert.equal(result.subscriptionId,"sub_123");
 assert.deepEqual(calls.map(x=>x.split(" ")[0]),["GET","GET","POST"]);
});
test("unpaid first payment blocks mandate and subscription creation",async()=>{
 let calls=0;
 const result=await bootstrapSandboxMonthlySubscription({...args,fetcher:async()=>{
  calls++;
  return {ok:true,json:async()=>({...first,status:"pending"})};
 }});
 assert.equal(result.created,false);
 assert.equal(result.stage,"first_payment");
 assert.equal(calls,1);
});
test("invalid mandate blocks subscription creation",async()=>{
 let calls=0;
 const result=await bootstrapSandboxMonthlySubscription({...args,fetcher:async(url)=>{
  calls++;
  if(url.includes("/payments/")) return {ok:true,json:async()=>first};
  return {ok:true,json:async()=>({_embedded:{mandates:[]}})};
 }});
 assert.equal(result.created,false);
 assert.equal(result.stage,"mandate");
 assert.equal(calls,2);
});

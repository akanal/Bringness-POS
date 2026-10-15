import test from "node:test";
import assert from "node:assert/strict";
import {reconcileVerifiedSandboxCancellation} from "./pos-license-recurring-cancel-verified.js";
const args={apiKey:"test_example",companyId:"company1",planCode:"online_pos",
 customerId:"cst_123",subscriptionId:"sub_123"};
test("active provider subscription cannot be canceled locally",async()=>{
 let updated=false;
 const pool={query:async()=>({rowCount:1,rows:[{mollie_customer_id:"cst_123"}]}),
 connect:()=>{updated=true;throw Error("unexpected write");}};
 const result=await reconcileVerifiedSandboxCancellation({...args,pool,fetcher:async()=>({
 ok:true,json:async()=>({id:"sub_123",customerId:"cst_123",mode:"test",status:"active"})
 })});
 assert.equal(result.reason,"provider_cancellation_not_verified");
 assert.equal(updated,false);
});
test("wrong local customer prevents Mollie calls",async()=>{
 const pool={query:async()=>({rowCount:1,rows:[{mollie_customer_id:"cst_other"}]})};
 const result=await reconcileVerifiedSandboxCancellation({...args,pool,fetcher:()=>{
 throw Error("unexpected provider call");
 }});
 assert.equal(result.reason,"subscription_not_registered");
});
test("live API key rejected without database or network",async()=>{
 const result=await reconcileVerifiedSandboxCancellation({...args,apiKey:"live_example",
 pool:{query:()=>{throw Error("unexpected query");}}});
 assert.equal(result.reason,"sandbox_test_key_required");
});

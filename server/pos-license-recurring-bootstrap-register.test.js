import test from "node:test";
import assert from "node:assert/strict";
import {bootstrapAndRegisterSandboxMonthlySubscription} from "./pos-license-recurring-bootstrap-register.js";
test("already registered plan blocks all provider calls",async()=>{
 const pool={query:async()=>({rowCount:1,rows:[{
  mollie_subscription_id:"sub_123",mollie_customer_id:"cst_123"
 }]})};
 const result=await bootstrapAndRegisterSandboxMonthlySubscription({
  pool,companyId:"company1",planCode:"online_pos",
  fetcher:()=>{throw Error("must not contact Mollie");}
 });
 assert.equal(result.created,false);
 assert.equal(result.reason,"subscription_already_registered");
});

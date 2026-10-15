import test from "node:test";
import assert from "node:assert/strict";
import {registerSandboxMonthlySubscription} from "./pos-license-recurring-register.js";
test("new subscription registers as pending",async()=>{
 const queries=[];
 const pool={connect:async()=>({query:async(sql)=>{
  queries.push(sql);
  if(sql.startsWith("INSERT INTO"))return {rowCount:1,rows:[{id:11}]};
  return {rowCount:0,rows:[]};
 },release(){}})};
 const r=await registerSandboxMonthlySubscription(pool,{companyId:"company1",planCode:"online_pos",customerId:"cst_123",subscriptionId:"sub_123"});
 assert.equal(r.registered,true);
 assert.equal(r.subscriptionRecordId,11);
 assert.equal(queries.includes("COMMIT"),true);
});
test("different subscription for same plan is rejected",async()=>{
 const pool={connect:async()=>({query:async(sql)=>{
  if(sql.startsWith("INSERT INTO"))return {rowCount:0,rows:[]};
  if(sql.startsWith("SELECT id,"))return {rowCount:1,rows:[{id:11,mollie_customer_id:"cst_123",mollie_subscription_id:"sub_other"}]};
  return {rowCount:0,rows:[]};
 },release(){}})};
 const r=await registerSandboxMonthlySubscription(pool,{companyId:"company1",planCode:"online_pos",customerId:"cst_123",subscriptionId:"sub_123"});
 assert.equal(r.reason,"existing_subscription_conflict");
});

import test from "node:test";
import assert from "node:assert/strict";
import {reconcileSandboxSubscriptionCancellation} from "./pos-license-recurring-cancel.js";
test("cancellation keeps the paid-through date and changes only status",async()=>{
 const queries=[];
 const pool={connect:async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.startsWith("SELECT id,status"))return {rowCount:1,rows:[{id:7,status:"active",paid_through:"2026-11-15T00:00:00Z"}]};
  return {rowCount:1,rows:[]};
 },release(){}})};
 const r=await reconcileSandboxSubscriptionCancellation(pool,{companyId:"company1",planCode:"online_pos",subscriptionId:"sub_123",providerStatus:"canceled"});
 assert.equal(r.updated,true);
 assert.equal(r.paidThrough,"2026-11-15T00:00:00Z");
 const update=queries.find(q=>q.sql.startsWith("UPDATE"));
 assert.match(update.sql,/SET status='canceled'/);
 assert.doesNotMatch(update.sql,/paid_through=/);
});
test("unverified status cannot cancel a subscription",async()=>{
 const r=await reconcileSandboxSubscriptionCancellation({connect(){throw Error("must not connect");}},{companyId:"company1",planCode:"online_pos",subscriptionId:"sub_123",providerStatus:"active"});
 assert.equal(r.updated,false);
});

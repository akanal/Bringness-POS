import test from "node:test";
import assert from "node:assert/strict";
import {getSandboxMonthlyEntitlements} from "./pos-license-recurring-entitlements.js";
test("reads only the authenticated company and preserves paid access after cancellation",async()=>{
 const pool={query:async(sql,args)=>{
  assert.match(sql,/WHERE company_id=\$1/);
  assert.deepEqual(args,["company_1"]);
  return {rows:[
   {plan_code:"online_pos",status:"canceled",paid_through:"2026-11-15T00:00:00Z"},
   {plan_code:"qr_module",status:"pending",paid_through:null}
  ]};
 }};
 const result=await getSandboxMonthlyEntitlements(pool,{
  companyId:"company_1",at:new Date("2026-10-15T00:00:00Z")
 });
 assert.equal(result.ok,true);
 assert.equal(result.plans[0].allowed,true);
 assert.equal(result.plans[1].allowed,false);
});
test("empty company identity is rejected before database access",async()=>{
 const result=await getSandboxMonthlyEntitlements({
  query:()=>{throw Error("unexpected query");}
 },{companyId:""});
 assert.deepEqual(result,{ok:false,reason:"company_required"});
});

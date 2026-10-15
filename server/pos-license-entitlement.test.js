import test from "node:test";
import assert from "node:assert/strict";
import {activateVerifiedPosLicense} from "./pos-license-entitlement.js";
const expected={paymentId:"tr_123ABC",companyId:"company-test",planCode:"download_license",checkoutId:"checkout-test",ownerEmailConfirmed:true};
const confirmed={verified:true,paymentId:"tr_123ABC",companyId:"company-test",planCode:"download_license",checkoutId:"checkout-test"};
function mockPool(existing=null) {
 const calls=[];
 const client={
  query:async(sql,args=[])=>{
   calls.push({sql,args});
   if(sql.startsWith("SELECT 1 FROM pg_indexes"))return {rows:[{exists:true}]};
   if(sql.startsWith("SELECT company_id,plan_code,checkout_id,amount_cents"))return {rows:[{company_id:"company-test",plan_code:"download_license",checkout_id:"checkout-test",amount_cents:39900,owner_email_confirmed_at:"2026-10-15T12:00:00Z"}]};
   if(sql.startsWith("SELECT id FROM billing_plans"))return {rows:[{id:"plan-1"}]};
   if(sql.startsWith("SELECT id,company_id,plan_id"))return {rows:existing?[existing]:[]};
   if(sql.startsWith("INSERT INTO company_entitlements"))return {rows:[{id:"entitlement-1"}]};
   return {rows:[]};
  },release:()=>{}
 };
 return {pool:{connect:async()=>client},calls};
}
test("rejects missing email confirmation without DB access",async()=>{
 const result=await activateVerifiedPosLicense({connect:()=>{throw Error("unexpected DB call")}},confirmed,{...expected,ownerEmailConfirmed:false});
 assert.equal(result.activated,false);
});
test("rejects mismatched provider confirmation",async()=>{
 const result=await activateVerifiedPosLicense({connect:()=>{throw Error("unexpected DB call")}},{...confirmed,companyId:"other"},expected);
 assert.equal(result.activated,false);
});
test("inserts entitlement after verification",async()=>{
 const {pool,calls}=mockPool();const result=await activateVerifiedPosLicense(pool,confirmed,expected);
 assert.equal(result.activated,true);assert.equal(result.alreadyActive,false);
 assert.equal(calls.filter(x=>x.sql.startsWith("INSERT INTO company_entitlements")).length,1);
 assert.equal(calls.at(-1).sql,"COMMIT");
});
test("does not insert duplicate entitlement on replay",async()=>{
 const {pool,calls}=mockPool({id:"existing",company_id:"company-test",plan_id:"plan-1"});
 const result=await activateVerifiedPosLicense(pool,confirmed,expected);
 assert.equal(result.alreadyActive,true);
 assert.equal(calls.some(x=>x.sql.startsWith("INSERT INTO company_entitlements")),false);
});
test("rejects payment reference owned by another company",async()=>{
 const {pool,calls}=mockPool({id:"existing",company_id:"other",plan_id:"plan-1"});
 const result=await activateVerifiedPosLicense(pool,confirmed,expected);
 assert.equal(result.activated,false);
 assert.equal(calls.some(x=>x.sql.startsWith("INSERT INTO company_entitlements")),false);
});

test("rejects database missing a unique provider reference index",async()=>{
 const calls=[];const pool={connect:async()=>({query:async(sql)=>{calls.push(sql);return {rows:[]}},release:()=>{}})};
 const result=await activateVerifiedPosLicense(pool,confirmed,expected);
 assert.equal(result.activated,false);
 assert.equal(result.reason,"unique_payment_constraint_missing");
 assert.equal(calls.some(sql=>sql.startsWith("INSERT INTO company_entitlements")),false);
});

test("does not grant perpetual monthly POS access for a one-off payment",async()=>{
 const {pool,calls}=mockPool();
 const result=await activateVerifiedPosLicense(pool,{...confirmed,planCode:"pos_base_monthly"},{...expected,planCode:"pos_base_monthly"});
 assert.equal(result.activated,false);
 assert.equal(result.reason,"recurring_billing_not_implemented");
 assert.equal(calls.some(x=>x.sql.startsWith("INSERT INTO company_entitlements")),false);
});

test("rejects owner confirmation revoked before database commit",async()=>{
 const calls=[];const pool={connect:async()=>({query:async(sql)=>{
  calls.push(sql);
  if(sql.startsWith("SELECT 1 FROM pg_indexes"))return {rows:[{exists:true}]};
  return {rows:[]};
 },release:()=>{}})};
 const result=await activateVerifiedPosLicense(pool,confirmed,expected);
 assert.equal(result.activated,false);
 assert.equal(result.reason,"checkout_state_changed");
 assert.equal(calls.some(sql=>sql.startsWith("INSERT INTO company_entitlements")),false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {processPosLicenseWebhook} from "./pos-license-webhook-flow.js";
const checkout={paymentId:"tr_123ABC",mode:"test",ownerEmailConfirmed:true,planCode:"download_license",companyId:"company-test",checkoutId:"checkout-test",amountCents:39900};
const payment={id:"tr_123ABC",status:"paid",testmode:true,paidAt:"2026-10-15T12:00:00Z",amount:{currency:"EUR",value:"399.00"},metadata:{bringnessCompanyId:"company-test",bringnessPlanCode:"download_license",bringnessCheckoutId:"checkout-test"}};
function database(){
 const calls=[];
 const pool={connect:async()=>({query:async(sql,args=[])=>{
  calls.push(sql);
  if(sql.startsWith("SELECT 1 FROM pg_index"))return {rows:[{exists:true}]};
  if(sql.startsWith("SELECT company_id,plan_code,checkout_id,amount_cents"))return {rows:[{company_id:"company-test",plan_code:"download_license",checkout_id:"checkout-test",amount_cents:39900,owner_email_confirmed_at:"2026-10-15T12:00:00Z"}]};
  if(sql.startsWith("SELECT id FROM billing_plans"))return {rows:[{id:"plan-1"}]};
  if(sql.startsWith("SELECT id,company_id,plan_id"))return {rows:[]};
  if(sql.startsWith("INSERT INTO company_entitlements"))return {rows:[{id:"license-1"}]};
  return {rows:[]};
 },release:()=>{}})};
 return {pool,calls};
}
test("paid TEST checkout with owner confirmation grants download license",async()=>{
 const {pool,calls}=database();
 const result=await processPosLicenseWebhook({paymentId:"tr_123ABC",lookupCheckout:async()=>checkout,pool,apiKey:"test_synthetic",fetcher:async()=>({ok:true,json:async()=>payment})});
 assert.equal(result.activated,true);
 assert.equal(calls.some(x=>x.startsWith("INSERT INTO company_entitlements")),true);
});
test("unconfirmed owner email cannot reach Mollie or database",async()=>{
 let called=false;
 const result=await processPosLicenseWebhook({paymentId:"tr_123ABC",lookupCheckout:async()=>({...checkout,ownerEmailConfirmed:false}),pool:{connect:()=>{called=true}},apiKey:"test_synthetic",fetcher:async()=>{called=true}});
 assert.equal(result.activated,false);assert.equal(called,false);
});
test("pending payment cannot grant license",async()=>{
 const {pool,calls}=database();
 const result=await processPosLicenseWebhook({paymentId:"tr_123ABC",lookupCheckout:async()=>checkout,pool,apiKey:"test_synthetic",fetcher:async()=>({ok:true,json:async()=>({...payment,status:"open"})})});
 assert.equal(result.activated,false);assert.equal(calls.length,0);
});
test("live-mode checkout is forbidden in isolated TEST flow",async()=>{
 let called=false;
 const result=await processPosLicenseWebhook({paymentId:"tr_123ABC",lookupCheckout:async()=>({...checkout,mode:"live"}),pool:{},apiKey:"live_synthetic",fetcher:async()=>{called=true}});
 assert.equal(result.activated,false);assert.equal(called,false);
});

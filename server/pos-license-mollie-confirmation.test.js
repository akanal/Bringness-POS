import test from "node:test";
import assert from "node:assert/strict";
import {confirmPosLicenseWithMollie} from "./pos-license-mollie-confirmation.js";
const expected={mode:"test",paymentId:"tr_123ABC",amountCents:3499,companyId:"company-test",planCode:"pos_base_monthly",checkoutId:"checkout-test"};
const payment={id:"tr_123ABC",status:"paid",testmode:true,paidAt:"2026-10-15T12:00:00Z",amount:{currency:"EUR",value:"34.99"},metadata:{bringnessCompanyId:"company-test",bringnessPlanCode:"pos_base_monthly",bringnessCheckoutId:"checkout-test"}};
test("reads Mollie payment before accepting",async()=>{
 let calls=0;
 const result=await confirmPosLicenseWithMollie("tr_123ABC",expected,"test_synthetic",async(url,options)=>{
  calls++;assert.equal(url,"https://api.mollie.com/v2/payments/tr_123ABC");
  assert.equal(options.headers.Authorization,"Bearer test_synthetic");
  return {ok:true,json:async()=>payment};
 });
 assert.equal(calls,1);assert.equal(result.verified,true);
});
test("rejects fake webhook ID without calling Mollie",async()=>{
 let called=false;
 const result=await confirmPosLicenseWithMollie("tr_123ABC?admin=true",expected,"test_synthetic",async()=>{called=true;});
 assert.equal(result.verified,false);assert.equal(called,false);
});
test("rejects production key in TEST mode without calling Mollie",async()=>{
 let called=false;
 const result=await confirmPosLicenseWithMollie("tr_123ABC",expected,"live_wrong",async()=>{called=true;});
 assert.equal(result.verified,false);assert.equal(called,false);
});
test("rejects unpaid Mollie response",async()=>{
 const result=await confirmPosLicenseWithMollie("tr_123ABC",expected,"test_synthetic",async()=>({ok:true,json:async()=>({...payment,status:"open"})}));
 assert.equal(result.verified,false);
});
test("rejects provider errors",async()=>{
 const result=await confirmPosLicenseWithMollie("tr_123ABC",expected,"test_synthetic",async()=>({ok:false}));
 assert.equal(result.verified,false);
});

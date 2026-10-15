import test from "node:test";
import assert from "node:assert/strict";
import {verifyPosLicensePayment} from "./pos-license-payment-verification.js";
const expected={mode:"test",paymentId:"tr_123ABC",amountCents:3499,companyId:"company-test",planCode:"pos_base_monthly",checkoutId:"checkout-test"};
const paid={id:"tr_123ABC",status:"paid",testmode:true,paidAt:"2026-10-15T12:00:00Z",amount:{currency:"EUR",value:"34.99"},metadata:{bringnessCompanyId:"company-test",bringnessPlanCode:"pos_base_monthly",bringnessCheckoutId:"checkout-test"}};
test("accepts exact synthetic test payment",()=>assert.equal(verifyPosLicensePayment(paid,expected).verified,true));
for(const [name,change] of Object.entries({
  pending:{status:"open"},wrongAmount:{amount:{currency:"EUR",value:"35.00"}},
  wrongCurrency:{amount:{currency:"USD",value:"34.99"}},wrongMode:{testmode:false},
  wrongCompany:{metadata:{...paid.metadata,bringnessCompanyId:"another-company"}},
  wrongCheckout:{metadata:{...paid.metadata,bringnessCheckoutId:"other"}},
  wrongPlan:{metadata:{...paid.metadata,bringnessPlanCode:"download_license"}},
  wrongId:{id:"tr_other"},missingTimestamp:{paidAt:null}
})){test("rejects "+name,()=>assert.equal(verifyPosLicensePayment({...paid,...change},expected).verified,false));}

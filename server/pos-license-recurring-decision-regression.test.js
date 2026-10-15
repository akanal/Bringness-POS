import test from "node:test";
import assert from "node:assert/strict";
import {decideMonthlyLicenseTransition} from "./pos-license-recurring-decision.js";
const subscription={id:"sub_123",customerId:"cst_123",status:"active"};
const payment={id:"tr_123",subscriptionId:"sub_123",customerId:"cst_123",
 status:"paid",amount:{currency:"EUR",value:"35.69"},
 metadata:{bringnessCompanyId:"company1",bringnessPlanCode:"online_pos"}};
const args={planCode:"online_pos",companyId:"company1",subscription,payment};
test("valid recurring paid payment renews",()=>{
 assert.equal(decideMonthlyLicenseTransition(args).action,"renew");
});
test("duplicate payment is idempotent",()=>{
 assert.equal(decideMonthlyLicenseTransition({...args,previousPaymentIds:["tr_123"]}).action,"noop");
});
test("wrong company or amount rejects",()=>{
 assert.equal(decideMonthlyLicenseTransition({...args,companyId:"other"}).action,"reject");
 assert.equal(decideMonthlyLicenseTransition({...args,payment:{...payment,amount:{currency:"EUR",value:"29.99"}}}).reason,"amount_mismatch");
});
test("failed payment does not renew",()=>{
 assert.equal(decideMonthlyLicenseTransition({...args,payment:{...payment,status:"failed"}}).action,"payment_failed");
});

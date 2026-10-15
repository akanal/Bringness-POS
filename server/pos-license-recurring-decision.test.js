import test from "node:test";
import assert from "node:assert/strict";
import { decideMonthlyLicenseTransition } from "./pos-license-recurring-decision.js";
const sample = {
  planCode: "online_pos", companyId: "company-1",
  subscription: { id: "sub_1", customerId: "cst_1", status: "active" },
  payment: { id: "tr_1", subscriptionId: "sub_1", customerId: "cst_1",
    status: "paid", amount: { currency: "EUR", value: "35.69" },
    metadata: { bringnessCompanyId: "company-1", bringnessPlanCode: "online_pos" } }
};
test("verified monthly payment renews", () => {
  assert.equal(decideMonthlyLicenseTransition(sample).action, "renew");
});
test("duplicate payment cannot renew twice", () => {
  assert.equal(decideMonthlyLicenseTransition({...sample,previousPaymentIds:["tr_1"]}).action,"noop");
});
test("unpaid and canceled subscriptions cannot renew", () => {
  for (const status of ["open","pending","failed","canceled","expired"]) {
    assert.notEqual(decideMonthlyLicenseTransition({...sample,payment:{...sample.payment,status}}).action,"renew");
  }
  assert.notEqual(decideMonthlyLicenseTransition({...sample,subscription:{...sample.subscription,status:"canceled"}}).action,"renew");
});
test("wrong payment identity or amount rejected", () => {
  const mismatches = [
    {...sample,companyId:"other"},
    {...sample,payment:{...sample.payment,customerId:"other"}},
    {...sample,payment:{...sample.payment,subscriptionId:"other"}},
    {...sample,payment:{...sample.payment,amount:{currency:"EUR",value:"1.00"}}},
  ];
  for (const value of mismatches) assert.equal(decideMonthlyLicenseTransition(value).action,"reject");
});

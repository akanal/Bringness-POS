import test from "node:test";
import assert from "node:assert/strict";
import {buildSandboxMonthlyInvoiceDraft} from "./pos-license-recurring-invoice-draft.js";
const base={companyId:"company1",paymentId:"tr_123",paymentStatus:"paid",
 customerBilling:{name:"Example GmbH",address:"Berlin"}};
test("all plans calculate net, VAT and gross in cents",()=>{
 for(const [planCode,net,vat,gross] of [
  ["online_pos",2999,570,3569],
  ["restaurant_module",6999,1330,8329],
  ["qr_module",2999,570,3569]
 ]){
  const r=buildSandboxMonthlyInvoiceDraft({...base,planCode});
  assert.equal(r.ready,true);
  assert.deepEqual([r.draft.netCents,r.draft.vatCents,r.draft.grossCents],[net,vat,gross]);
 }
});
test("unpaid payments and missing billing details cannot produce drafts",()=>{
 assert.equal(buildSandboxMonthlyInvoiceDraft({...base,planCode:"online_pos",paymentStatus:"failed"}).ready,false);
 assert.equal(buildSandboxMonthlyInvoiceDraft({...base,planCode:"online_pos",customerBilling:null}).ready,false);
});

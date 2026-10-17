import test from "node:test";
import assert from "node:assert/strict";
import {validateSandboxInvoiceDetails} from "./pos-license-recurring-invoice-compliance.js";

const complete={
 issuer:{name:"Sandbox Supplier",address:"Test Street 1, Berlin",taxNumber:"TEST-123"},
 customer:{name:"Sandbox Customer",address:"Example Road 2, Berlin"},
 servicePeriod:{start:"2026-10-01",end:"2026-10-31"},
 invoiceDate:"2026-10-16",invoiceNumber:"TEST-2026-0000001",
 serviceDescription:"Online POS monthly subscription October 2026",
 netCents:2999,vatCents:570,grossCents:3569,vatRatePercent:19
};
test("complete sandbox invoice passes",()=>{
 assert.deepEqual(validateSandboxInvoiceDetails(complete),{ready:true,missing:[]});
});
test("missing issuer identity blocks issuance",()=>{
 const result=validateSandboxInvoiceDetails({...complete,issuer:{}});
 assert.equal(result.ready,false);
 assert.ok(result.missing.includes("issuer.name"));
});
test("incorrect VAT blocks issuance",()=>{
 const result=validateSandboxInvoiceDetails({...complete,vatCents:569,grossCents:3568});
 assert.equal(result.ready,false);
 assert.ok(result.missing.includes("amounts"));
});
test("missing service description blocks issuance",()=>{
 const result=validateSandboxInvoiceDetails({...complete,serviceDescription:""});
 assert.ok(result.missing.includes("serviceDescription"));
});

test("impossible invoice date is rejected",()=>{
 const result=validateSandboxInvoiceDetails({...complete,invoiceDate:"2026-02-30"});
 assert.ok(result.missing.includes("invoiceDate"));
});
test("invalid service period date is rejected",()=>{
 const result=validateSandboxInvoiceDetails({...complete,servicePeriod:{start:"2026-02-30",end:"2026-10-31"}});
 assert.ok(result.missing.includes("servicePeriod"));
});
test("non ISO invoice date is rejected",()=>{
 const result=validateSandboxInvoiceDetails({...complete,invoiceDate:"16.10.2026"});
 assert.ok(result.missing.includes("invoiceDate"));
});

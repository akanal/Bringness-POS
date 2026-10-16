import test from "node:test";
import assert from "node:assert/strict";
import {assertIssuedSandboxInvoice} from "./pos-license-recurring-invoice-snapshot-validate.js";
const details={issuer:{name:"Supplier",address:"Berlin",taxNumber:"TEST"},customer:{name:"Customer",address:"Berlin"},servicePeriod:{start:"2026-10-01",end:"2026-10-31"},serviceDescription:"POS October",invoiceDate:"2026-10-16",invoiceNumber:"TEST-2026-1",netCents:2999,vatCents:570,grossCents:3569,vatRatePercent:19};
test("complete issued snapshot accepted",()=>assert.equal(assertIssuedSandboxInvoice(details),details));
test("missing issuer blocks export",()=>assert.throws(()=>assertIssuedSandboxInvoice({...details,issuer:{}}),/invalid_issued_invoice_snapshot/));
test("incorrect totals block export",()=>assert.throws(()=>assertIssuedSandboxInvoice({...details,grossCents:3000}),/amounts/));

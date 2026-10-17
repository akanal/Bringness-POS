import test from "node:test";
import assert from "node:assert/strict";
import {renderSandboxInvoiceHtml} from "./pos-license-recurring-invoice-html.js";
const details={
 invoiceNumber:"TEST-2026-0000001",invoiceDate:"2026-10-16",
 issuer:{name:"Example Supplier",address:"Berlin",taxNumber:"TEST"},
 customer:{name:"Example Customer",address:"Berlin"},
 servicePeriod:{start:"2026-10-01",end:"2026-10-31"},
 serviceDescription:"Monthly POS",netCents:2999,vatCents:570,grossCents:3569,vatRatePercent:19
};
test("renders invoice amounts and reference",()=>{
 const html=renderSandboxInvoiceHtml(details);
 assert.match(html,/TEST-2026-0000001/);
 assert.match(html,/35,69 €/);
});
test("escapes user-provided invoice content",()=>{
 const html=renderSandboxInvoiceHtml({...details,serviceDescription:"<script>alert(1)</script>"});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
test("rejects incomplete snapshots",()=>{
 assert.throws(()=>renderSandboxInvoiceHtml({}),/issued_invoice_details_required/);
});

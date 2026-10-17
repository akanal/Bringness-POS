import test from "node:test";
import assert from "node:assert/strict";
import {renderSandboxInvoicePrintHtml} from "./pos-license-recurring-invoice-print.js";
import {exportSandboxInvoiceJson} from "./pos-license-recurring-invoice-json.js";
const details={invoiceNumber:"TEST-2026-0000002",invoiceDate:"2026-10-16",issuer:{name:"Test Supplier",address:"Berlin"},customer:{name:"Test Customer",address:"Berlin"},serviceDescription:"Monthly POS",servicePeriod:{start:"2026-10-01",end:"2026-10-31"},netCents:2999,vatCents:570,grossCents:3569,vatRatePercent:19};
test("A4 invoice is print-ready",()=>assert.match(renderSandboxInvoicePrintHtml(details),/@page\{size:A4/));
test("JSON export retains totals",()=>assert.equal(JSON.parse(exportSandboxInvoiceJson(details)).grossCents,3569));
test("JSON export is explicitly not EN16931",()=>assert.match(exportSandboxInvoiceJson(details),/bringness-sandbox-invoice-v1/));

import test from "node:test";
import assert from "node:assert/strict";
import {findSandboxInvoiceExportForCompany} from "./pos-license-recurring-invoice-view.js";
test("rejects unsupported format before database access",async()=>{
 let queries=0;const pool={query:async()=>{queries++;throw new Error("unexpected_query")}};
 await assert.rejects(findSandboxInvoiceExportForCompany(pool,"company","INV-1","pdf"),/unsupported_invoice_format/);
 assert.equal(queries,0);
});
test("missing company scope cannot query invoices",async()=>{
 let queries=0;const pool={query:async()=>{queries++;throw new Error("unexpected_query")}};
 assert.equal(await findSandboxInvoiceExportForCompany(pool,"","INV-1","html"),null);
 assert.equal(queries,0);
});
test("unissued invoice is not exported",async()=>{
 const pool={query:async(sql,params)=>{assert.match(sql,/status='issued'/);assert.deepEqual(params,["company","INV-1"]);return {rowCount:0,rows:[]}}};
 assert.equal(await findSandboxInvoiceExportForCompany(pool,"company","INV-1","print"),null);
});

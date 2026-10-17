import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const start=readFileSync(new URL("./pos-license-sandbox-start.js",import.meta.url),"utf8");
test("sandbox imports only dedicated webhook, not full POS startup",()=>{
 assert.match(start,/handlePosLicenseWebhook/);
 assert.doesNotMatch(start,/from\s+["']\.\/start\.js["']/);
 assert.doesNotMatch(start,/migrateBillingAccess\(/);
 assert.doesNotMatch(start,/migrateBillingTerms\(/);
});
test("sandbox rejects live Mollie keys",()=>{
 assert.match(start,/startsWith\("test_"\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const schema=readFileSync(new URL("../ops/pos-license-sandbox-init.sql",import.meta.url),"utf8");
test("sandbox database has isolated license checkout and entitlement tables",()=>{
 for(const table of ["companies","billing_plans","company_entitlements","sandbox_pos_license_checkouts"]){
  assert.match(schema,new RegExp("CREATE TABLE IF NOT EXISTS "+table+"\\b"));
 }
});
test("provider reference is unique and payment ID is checkout primary key",()=>{
 assert.match(schema,/provider_reference text NOT NULL UNIQUE/);
 assert.match(schema,/payment_id text PRIMARY KEY/);
});
test("sandbox cannot seed recurring plans",()=>{
 assert.match(schema,/VALUES \('download_license'\)/);
 assert.doesNotMatch(schema,/VALUES \('pos_base_monthly'\)/);
});

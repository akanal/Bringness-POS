import test from "node:test";
import assert from "node:assert/strict";
import {billingQuote} from "./billing-quote.js";

test("monthly contract price drives first and recurring gross",()=>{
  assert.deepEqual(billingQuote({billing_type:"monthly",amount_cents:2999},{monthly_net_cents:1999}),{netCents:1999,vatCents:380,grossCents:2379});
  assert.deepEqual(billingQuote({billing_type:"monthly",amount_cents:2999},null),{netCents:2999,vatCents:570,grossCents:3569});
});
test("download price never inherits monthly conditions",()=>{
  assert.deepEqual(billingQuote({billing_type:"one_time",amount_cents:39900},{monthly_net_cents:1999}),{netCents:39900,vatCents:7581,grossCents:47481});
});

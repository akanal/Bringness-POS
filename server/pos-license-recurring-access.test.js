import test from "node:test";
import assert from "node:assert/strict";
import {sandboxMonthlyAccess} from "./pos-license-recurring-access.js";
const at=new Date("2026-10-15T12:00:00Z");
test("active paid subscription allows access",()=>{
 assert.equal(sandboxMonthlyAccess({status:"active",paidThrough:"2026-11-15T12:00:00Z"},at).allowed,true);
});
test("cancellation preserves prepaid access",()=>{
 assert.equal(sandboxMonthlyAccess({status:"canceled",paidThrough:"2026-11-15T12:00:00Z"},at).allowed,true);
});
test("past due preserves prepaid access",()=>{
 assert.equal(sandboxMonthlyAccess({status:"past_due",paidThrough:"2026-11-15T12:00:00Z"},at).allowed,true);
});
test("expired time never grants access",()=>{
 assert.equal(sandboxMonthlyAccess({status:"active",paidThrough:"2026-10-14T12:00:00Z"},at).allowed,false);
});
test("pending subscription never grants access",()=>{
 assert.equal(sandboxMonthlyAccess({status:"pending",paidThrough:"2026-11-15T12:00:00Z"},at).allowed,false);
});
test("invalid expiry never grants access",()=>{
 assert.equal(sandboxMonthlyAccess({status:"active",paidThrough:"not-a-date"},at).allowed,false);
});

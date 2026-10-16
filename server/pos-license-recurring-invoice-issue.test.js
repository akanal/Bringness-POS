import test from "node:test";
import assert from "node:assert/strict";
import {issueSandboxMonthlyInvoice} from "./pos-license-recurring-invoice-issue.js";
const payment="tr_sandbox",company="company-sandbox";
function poolFor({snapshot,updateCount=1}={}){
 const calls=[];const client={query:async(sql)=>{
  calls.push(sql);
  if(sql.startsWith("SELECT p.mollie_payment_id"))return {rowCount:1,rows:[{mollie_payment_id:payment}]};
  if(sql.startsWith("SELECT id,invoice_number"))return {rowCount:1,rows:[{id:1,status:"issued",invoice_number:"TEST-1"}]};
  if(sql.startsWith("SELECT issued_details"))return {rowCount:1,rows:[{issued_details:snapshot}]};
  return {rowCount:updateCount,rows:[]};
 },release:()=>{}};
 return {pool:{connect:async()=>client},calls};
}
test("issued invoice without snapshot is not reported successful",async()=>{
 const {pool}=poolFor({snapshot:null});
 assert.equal((await issueSandboxMonthlyInvoice(pool,{paymentId:payment,companyId:company})).reason,"issued_invoice_snapshot_missing");
});
test("issued invoice with malformed snapshot is not reported successful",async()=>{
 const {pool}=poolFor({snapshot:{currency:"USD"}});
 assert.equal((await issueSandboxMonthlyInvoice(pool,{paymentId:payment,companyId:company})).reason,"issued_invoice_snapshot_invalid");
});

import test from "node:test";
import assert from "node:assert/strict";
import {saveSandboxMonthlyInvoiceDraft} from "./pos-license-recurring-invoice-store.js";
const args={companyId:"company1",planCode:"online_pos",paymentId:"tr_123",customerBilling:{name:"Test GmbH",address:"Berlin"},invoiceDate:"2026-10-15T12:00:00Z"};
function mockPool({paid=true,existing=false}={}){
 const queries=[];
 const client={async query(sql,params){
  queries.push({sql,params});
  if(sql.includes("JOIN sandbox_pos_monthly_subscriptions"))return {rowCount:paid?1:0,rows:paid?[{mollie_payment_id:"tr_123"}]:[]};
  if(sql.includes("SELECT invoice_number"))return {rowCount:existing?1:0,rows:existing?[{invoice_number:"TEST-2026-0000001"}]:[]};
  if(sql.includes("nextval("))return {rowCount:1,rows:[{n:"1"}]};
  return {rowCount:1,rows:[]};
 },release(){queries.push({sql:"RELEASE"});}};
 return {queries,connect:async()=>client};
}
test("paid record creates VAT-correct draft with test invoice number",async()=>{
 const pool=mockPool();
 const r=await saveSandboxMonthlyInvoiceDraft(pool,args);
 assert.equal(r.saved,true);
 assert.equal(r.invoiceNumber,"TEST-2026-0000001");
 const insert=pool.queries.find(q=>q.sql.includes("INSERT INTO sandbox_pos_monthly_invoice_drafts"));
 assert.deepEqual(insert.params.slice(5,8),[2999,570,3569]);
 assert.equal(pool.queries.some(q=>q.sql==="COMMIT"),true);
});
test("unpaid or unregistered payment is refused",async()=>{
 const pool=mockPool({paid:false});
 const r=await saveSandboxMonthlyInvoiceDraft(pool,args);
 assert.equal(r.reason,"paid_payment_not_recorded");
 assert.equal(pool.queries.some(q=>q.sql.includes("INSERT INTO sandbox_pos_monthly_invoice_drafts")),false);
});
test("existing draft is reused on retry",async()=>{
 const pool=mockPool({existing:true});
 const r=await saveSandboxMonthlyInvoiceDraft(pool,args);
 assert.equal(r.alreadyExists,true);
 assert.equal(pool.queries.some(q=>q.sql.includes("nextval(")),false);
});

// Sandbox-only draft storage. Caller must supply trusted company ownership
// and customer billing details; never accept webhook data as verification.
import {buildSandboxMonthlyInvoiceDraft} from "./pos-license-recurring-invoice-draft.js";
export async function saveSandboxMonthlyInvoiceDraft(pool,{
 companyId,planCode,paymentId,customerBilling,invoiceDate=new Date()
}){
 const candidate=buildSandboxMonthlyInvoiceDraft({
  companyId,planCode,paymentId,customerBilling,paymentStatus:"paid"
 });
 if(!candidate.ready) return {saved:false,reason:candidate.reason};
 const date=new Date(invoiceDate);
 if(!Number.isFinite(date.getTime())) return {saved:false,reason:"invalid_invoice_date"};
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const verified=await client.query(
   "SELECT p.mollie_payment_id FROM sandbox_pos_monthly_payments p JOIN sandbox_pos_monthly_subscriptions s ON s.id=p.subscription_id WHERE p.mollie_payment_id=$1 AND p.payment_status='paid' AND s.company_id=$2 AND s.plan_code=$3 FOR UPDATE OF p",
   [paymentId,companyId,planCode]);
  if(verified.rowCount!==1){
   await client.query("ROLLBACK");
   return {saved:false,reason:"paid_payment_not_recorded"};
  }
  const existing=await client.query(
   "SELECT invoice_number FROM sandbox_pos_monthly_invoice_drafts WHERE mollie_payment_id=$1",
   [paymentId]);
  if(existing.rowCount){
   await client.query("COMMIT");
   return {saved:true,alreadyExists:true,invoiceNumber:existing.rows[0].invoice_number};
  }
  const seq=await client.query("SELECT nextval('sandbox_pos_invoice_number_seq') AS n");
  const invoiceNumber="TEST-"+String(date.getUTCFullYear())+"-"+String(seq.rows[0].n).padStart(7,"0");
  const d=candidate.draft;
  await client.query(
   "INSERT INTO sandbox_pos_monthly_invoice_drafts(mollie_payment_id,company_id,plan_code,invoice_number,invoice_date,net_cents,vat_cents,gross_cents,customer_billing) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
   [paymentId,companyId,planCode,invoiceNumber,date.toISOString().slice(0,10),d.netCents,d.vatCents,d.grossCents,JSON.stringify(d.customerBilling)]);
  await client.query("COMMIT");
  return {saved:true,invoiceNumber,status:"draft"};
 }catch(e){await client.query("ROLLBACK");throw e;}
 finally{client.release();}
}

import {validateSandboxInvoiceDetails} from "./pos-license-recurring-invoice-compliance.js";
// Sandbox-only issuance: finalize an existing draft only after the associated
// payment has been recorded as paid. No external payment or email is triggered.
// This does not itself certify German tax/legal invoice compliance.
const invoiceIsoDate=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
export async function issueSandboxMonthlyInvoice(pool,{paymentId,companyId,issuer,servicePeriod,serviceDescription}){
 if(typeof paymentId!=="string"||!paymentId.trim()||typeof companyId!=="string"||!companyId.trim())
  return {issued:false,reason:"invalid_input"};
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const paid=await client.query(
   "SELECT p.mollie_payment_id FROM sandbox_pos_monthly_payments p JOIN sandbox_pos_monthly_subscriptions s ON s.id=p.subscription_id WHERE p.mollie_payment_id=$1 AND p.payment_status='paid' AND s.company_id=$2 FOR UPDATE OF p",
   [paymentId,companyId]);
  if(paid.rowCount!==1){await client.query("ROLLBACK");return {issued:false,reason:"payment_not_verified"};}
  const invoice=await client.query(
   "SELECT id,invoice_number,invoice_date,net_cents,vat_cents,gross_cents,customer_billing,status FROM sandbox_pos_monthly_invoice_drafts WHERE mollie_payment_id=$1 AND company_id=$2 FOR UPDATE",
   [paymentId,companyId]);
  if(invoice.rowCount!==1){await client.query("ROLLBACK");return {issued:false,reason:"invoice_draft_missing"};}
  const row=invoice.rows[0];
  if(row.status==="issued"){
   const snapshot=await client.query("SELECT issued_details FROM sandbox_pos_monthly_invoice_drafts WHERE id=$1",[row.id]);
   if(!snapshot.rows[0]?.issued_details){await client.query("ROLLBACK");return {issued:false,reason:"issued_invoice_snapshot_missing"};}
   await client.query("COMMIT");return {issued:true,alreadyIssued:true,invoiceNumber:row.invoice_number};
  }
  if(row.status!=="draft"){await client.query("ROLLBACK");return {issued:false,reason:"invalid_invoice_status"};}
  const completeness=validateSandboxInvoiceDetails({
   issuer,customer:row.customer_billing,servicePeriod,serviceDescription,vatRatePercent:19,
   invoiceDate:invoiceIsoDate(row.invoice_date),invoiceNumber:row.invoice_number,
   netCents:row.net_cents,vatCents:row.vat_cents,grossCents:row.gross_cents
  });
  if(!completeness.ready){
   await client.query("ROLLBACK");
   return {issued:false,reason:"invoice_details_incomplete",missing:completeness.missing};
  }
  await client.query(
   "UPDATE sandbox_pos_monthly_invoice_drafts SET status='issued',issued_at=now(),issued_details=$2::jsonb WHERE id=$1 AND status='draft'",
   [row.id,JSON.stringify({issuer,customer:row.customer_billing,servicePeriod,serviceDescription,invoiceNumber:row.invoice_number,invoiceDate:invoiceIsoDate(row.invoice_date),currency:'EUR',netCents:row.net_cents,vatCents:row.vat_cents,grossCents:row.gross_cents,vatRatePercent:19})]);
  await client.query("COMMIT");
  return {issued:true,invoiceNumber:row.invoice_number,status:"issued"};
 }catch(error){await client.query("ROLLBACK");throw error;}
 finally{client.release();}
}

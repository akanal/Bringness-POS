// Connect verified sandbox renewals to idempotent invoice drafts.
// This does not charge customers or issue legally final invoices.
import {reconcileSandboxMonthlyPayment} from "./pos-license-recurring-reconcile.js";
import {saveSandboxMonthlyInvoiceDraft} from "./pos-license-recurring-invoice-store.js";

export async function reconcileAndDraftSandboxMonthlyPayment({
 pool,apiKey,paymentId,paidThrough,customerBilling,fetcher=fetch
}) {
 const payment=await reconcileSandboxMonthlyPayment({
  pool,apiKey,paymentId,paidThrough,fetcher
 });
 if(!payment.renewed && !payment.alreadyProcessed)
  return {payment,invoice:{saved:false,reason:"renewal_not_confirmed"}};
 const owner=await pool.query(
  "SELECT s.company_id,s.plan_code FROM sandbox_pos_monthly_payments p "+
  "JOIN sandbox_pos_monthly_subscriptions s ON s.id=p.subscription_id "+
  "WHERE p.mollie_payment_id=$1 AND p.payment_status='paid'",
  [paymentId]
 );
 if(owner.rowCount!==1)
  return {payment,invoice:{saved:false,reason:"paid_payment_not_recorded"}};
 const {company_id:companyId,plan_code:planCode}=owner.rows[0];
 const invoice=await saveSandboxMonthlyInvoiceDraft(pool,{
  companyId,planCode,paymentId,customerBilling
 });
 return {payment,invoice};
}

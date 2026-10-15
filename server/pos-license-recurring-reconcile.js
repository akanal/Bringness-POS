// Provider-confirmed renewal notification reconciliation.
// Webhook supplies only paymentId. All other identifiers come from the
// registered sandbox subscription, not from webhook parameters.
import {verifyMonthlyMolliePayment} from "./pos-license-recurring-mollie-readback.js";
import {persistVerifiedMonthlyRenewal} from "./pos-license-recurring-storage.js";
import {recordSandboxMonthlyPaymentFailure} from "./pos-license-recurring-failure.js";

export async function reconcileSandboxMonthlyPayment({
 pool,apiKey,paymentId,paidThrough,fetcher=fetch
}) {
 if(!/^tr_[A-Za-z0-9]+$/.test(String(paymentId||"")))
   return {processed:false,reason:"invalid_payment_id"};
 // Fetch the payment first only to locate a previously registered subscription.
 // No subscription identity supplied by the external webhook is trusted.
 if(!String(apiKey||"").startsWith("test_"))
   return {processed:false,reason:"sandbox_test_key_required"};
 const response=await fetcher("https://api.mollie.com/v2/payments/"+paymentId,{
  method:"GET",redirect:"error",
  headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok) return {processed:false,reason:"provider_read_failed"};
 const payment=await response.json();
 if(payment.id!==paymentId || payment.mode!=="test" ||
    !/^sub_[A-Za-z0-9]+$/.test(String(payment.subscriptionId||"")) ||
    !/^cst_[A-Za-z0-9]+$/.test(String(payment.customerId||"")))
   return {processed:false,reason:"unrecognized_subscription_payment"};
 const row=await pool.query(
  "SELECT company_id,plan_code,mollie_customer_id,mollie_subscription_id FROM sandbox_pos_monthly_subscriptions WHERE mollie_subscription_id=$1 AND mollie_customer_id=$2",
  [payment.subscriptionId,payment.customerId]
 );
 if(row.rowCount!==1) return {processed:false,reason:"subscription_not_registered"};
 const subscription=row.rows[0];
 const decision=await verifyMonthlyMolliePayment({
  apiKey,paymentId,companyId:subscription.company_id,planCode:subscription.plan_code,
  customerId:subscription.mollie_customer_id,
  subscriptionId:subscription.mollie_subscription_id,fetcher
 });
 if(decision.action==="renew"){
  // Caller must supply paidThrough from independently verified billing records;
  // this module never infers it from webhook, local clock or payment status.
  if(!paidThrough) return {processed:false,reason:"verified_paid_through_required"};
  return persistVerifiedMonthlyRenewal(pool,{
   companyId:subscription.company_id,planCode:subscription.plan_code,
   subscriptionId:subscription.mollie_subscription_id,paymentId,paidThrough,decision
  });
 }
 if(decision.action==="payment_failed"){
  return recordSandboxMonthlyPaymentFailure(pool,{
   companyId:subscription.company_id,planCode:subscription.plan_code,
   subscriptionId:subscription.mollie_subscription_id,paymentId,decision
  });
 }
 return {processed:false,reason:decision.reason||decision.action};
}

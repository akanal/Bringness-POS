// Orchestrate initial subscription setup and sandbox persistence.
// This must be called only after authenticated ownership and an application
// lock/idempotency key have been established by the HTTP controller.
import {bootstrapSandboxMonthlySubscription} from "./pos-license-recurring-bootstrap.js";
import {registerSandboxMonthlySubscription} from "./pos-license-recurring-register.js";
export async function bootstrapAndRegisterSandboxMonthlySubscription({
 pool,apiKey,paymentId,customerId,companyId,planCode,webhookUrl,fetcher=fetch
}){
 // Reject a second request for an already-registered plan before contacting
 // Mollie. The controller still must serialize concurrent requests.
 const existing=await pool.query(
  "SELECT mollie_subscription_id,mollie_customer_id FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 AND plan_code=$2",
  [companyId,planCode]);
 if(existing.rowCount){
  return {created:false,reason:"subscription_already_registered",
   subscriptionId:existing.rows[0].mollie_subscription_id};
 }
 const result=await bootstrapSandboxMonthlySubscription({
  apiKey,paymentId,customerId,companyId,planCode,webhookUrl,fetcher
 });
 if(!result.created) return result;
 const registered=await registerSandboxMonthlySubscription(pool,{
  companyId,planCode,customerId,subscriptionId:result.subscriptionId
 });
 return {...result,registered:registered.registered,
  registrationReason:registered.reason||null};
}

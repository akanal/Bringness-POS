// Orchestrate initial subscription setup and sandbox persistence.
// This must be called only after authenticated ownership and an application
// lock/idempotency key have been established by the HTTP controller.
import {bootstrapSandboxMonthlySubscription} from "./pos-license-recurring-bootstrap.js";
import {registerSandboxMonthlySubscription} from "./pos-license-recurring-register.js";
export async function bootstrapAndRegisterSandboxMonthlySubscription({
 pool,apiKey,paymentId,customerId,companyId,planCode,webhookUrl,fetcher=fetch
}){
 // Serialize per company and plan in the sandbox before contacting Mollie.\n // The lock is session-scoped because provider API calls cannot be part of\n // a database transaction. Keep this connection until registration completes.
 if (!companyId || !["online_pos","restaurant_module","qr_module"].includes(planCode))
  return {created:false,reason:"invalid_company_or_plan"};
 const lockClient=await pool.connect();\n try {\n await lockClient.query(\"SELECT pg_advisory_lock(hashtext($1),hashtext($2))\",[companyId,planCode]);\n const existing=await lockClient.query(
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
  registrationReason:registered.reason||null};\n } finally {\n  try { await lockClient.query(\"SELECT pg_advisory_unlock(hashtext($1),hashtext($2))\",[companyId,planCode]); }\n  finally { lockClient.release(); }\n }\n}

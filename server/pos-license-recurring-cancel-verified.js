// Reconcile cancellation only after reading the subscription from Mollie TEST.
// The webhook is a hint, never authoritative subscription state.
import {reconcileSandboxSubscriptionCancellation} from "./pos-license-recurring-cancel.js";

const valid = (value,prefix) => typeof value === "string" &&
  new RegExp("^"+prefix+"[A-Za-z0-9]+$").test(value);

export async function reconcileVerifiedSandboxCancellation({
 pool,apiKey,companyId,planCode,customerId,subscriptionId,fetcher=fetch
}) {
 if (!String(apiKey||"").startsWith("test_"))
   return {updated:false,reason:"sandbox_test_key_required"};
 if (!companyId || !["online_pos","restaurant_module","qr_module"].includes(planCode) ||
     !valid(customerId,"cst_") || !valid(subscriptionId,"sub_"))
   return {updated:false,reason:"invalid_subscription_identity"};
 const local=await pool.query(
  "SELECT mollie_customer_id FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 AND plan_code=$2 AND mollie_subscription_id=$3",
  [companyId,planCode,subscriptionId]);
 if(local.rowCount!==1 || local.rows[0].mollie_customer_id!==customerId)
   return {updated:false,reason:"subscription_not_registered"};
 const response=await fetcher(
  "https://api.mollie.com/v2/customers/"+customerId+"/subscriptions/"+subscriptionId,{
  method:"GET",redirect:"error",
  headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok) return {updated:false,reason:"provider_read_failed"};
 const subscription=await response.json();
 if(subscription.id!==subscriptionId || subscription.customerId!==customerId ||
    subscription.mode!=="test" || !["canceled","completed"].includes(subscription.status))
   return {updated:false,reason:"provider_cancellation_not_verified"};
 return reconcileSandboxSubscriptionCancellation(pool,{
  companyId,planCode,subscriptionId,providerStatus:subscription.status
 });
}

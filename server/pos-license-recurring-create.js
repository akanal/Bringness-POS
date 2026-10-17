// Sandbox-only subscription creation. Requires an existing Mollie customer
// with a valid recurring mandate, established through a separate first payment.
// Does not initiate any charge unless explicitly called by an authorized server.
const MONTHLY_NET_CENTS = Object.freeze({
  online_pos: 2999, restaurant_module: 6999, qr_module: 2999
});
export function monthlyGrossAmount(planCode) {
  const net = MONTHLY_NET_CENTS[planCode];
  if (!net) return null;
  return (Math.round(net * 119 / 100) / 100).toFixed(2);
}
export async function createSandboxMonthlySubscription({
  apiKey, customerId, planCode, companyId, webhookUrl, fetcher = fetch
}) {
  if (!String(apiKey || "").startsWith("test_"))
    return {created:false,reason:"sandbox_test_key_required"};
  if (!/^cst_[A-Za-z0-9]+$/.test(String(customerId || "")) ||
      !companyId || !monthlyGrossAmount(planCode))
    return {created:false,reason:"invalid_subscription_request"};
  let webhook;
  try { webhook = new URL(webhookUrl); }
  catch { return {created:false,reason:"invalid_webhook_url"}; }
  if (webhook.protocol !== "https:" || webhook.username || webhook.password ||
      webhook.search || webhook.hash)
    return {created:false,reason:"invalid_webhook_url"};
  const response = await fetcher(
    "https://api.mollie.com/v2/customers/" + customerId + "/subscriptions", {
      method:"POST",redirect:"error",
      headers:{Authorization:"Bearer " + apiKey,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({
        amount:{currency:"EUR",value:monthlyGrossAmount(planCode)},
        interval:"1 month",
        description:"Bringness POS " + planCode,
        webhookUrl:webhook.href,
        metadata:{bringnessCompanyId:String(companyId),bringnessPlanCode:planCode}
      }),
      signal:AbortSignal.timeout(15000)
    }
  );
  if (!response.ok) return {created:false,reason:"provider_create_failed"};
  const subscription = await response.json();
  if (!/^sub_[A-Za-z0-9]+$/.test(String(subscription.id || "")) ||
      subscription.customerId !== customerId ||
      subscription.mode !== "test")
    return {created:false,reason:"provider_response_mismatch"};
  return {created:true,subscriptionId:subscription.id,customerId,planCode,companyId,
    status:subscription.status};
}

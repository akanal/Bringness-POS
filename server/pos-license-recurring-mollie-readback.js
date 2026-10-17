// Isolated Mollie subscription readback. A webhook is only a notification:
// never trust its body as evidence of payment or subscription status.
import {decideMonthlyLicenseTransition} from "./pos-license-recurring-decision.js";

const validId = (id, prefix) => typeof id === "string" &&
  new RegExp("^" + prefix + "[A-Za-z0-9]+$").test(id);

async function readMollieResource(url, apiKey, fetcher) {
  const response = await fetcher(url, {
    method: "GET", redirect: "error",
    headers: {Authorization: "Bearer " + apiKey, Accept: "application/json"},
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return null;
  return response.json();
}

export async function verifyMonthlyMolliePayment({
  apiKey, paymentId, companyId, planCode, customerId, subscriptionId,
  previousPaymentIds = [], fetcher = fetch
}) {
  if (!String(apiKey || "").startsWith("test_"))
    return {action:"reject",reason:"sandbox_test_key_required"};
  if (!validId(paymentId,"tr_") || !validId(customerId,"cst_") ||
      !validId(subscriptionId,"sub_"))
    return {action:"reject",reason:"invalid_provider_reference"};
  const root = "https://api.mollie.com/v2";
  const payment = await readMollieResource(root + "/payments/" + paymentId,apiKey,fetcher);
  if (!payment || payment.id !== paymentId || payment.mode !== "test")
    return {action:"reject",reason:"payment_not_verified"};
  const subscription = await readMollieResource(root + "/customers/" + customerId +
    "/subscriptions/" + subscriptionId,apiKey,fetcher);
  if (!subscription || subscription.id !== subscriptionId ||
      subscription.customerId !== customerId || subscription.mode !== "test")
    return {action:"reject",reason:"subscription_not_verified"};
  return decideMonthlyLicenseTransition({
    planCode, companyId, payment, subscription, previousPaymentIds
  });
}

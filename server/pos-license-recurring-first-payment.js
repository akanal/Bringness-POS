// First-payment mandate bootstrap for isolated Mollie sandbox.
// A recurring subscription requires a customer mandate. This creates only
// a test-mode first-payment checkout; no production credentials are accepted.
import {monthlyGrossAmount} from "./pos-license-recurring-create.js";

export async function createSandboxFirstPayment({
  apiKey, companyId, planCode, customerId, redirectUrl, webhookUrl,
  fetcher = fetch
}) {
  if (!String(apiKey || "").startsWith("test_"))
    return {created:false,reason:"sandbox_test_key_required"};
  if (!companyId || !/^cst_[A-Za-z0-9]+$/.test(String(customerId || "")) ||
      !monthlyGrossAmount(planCode))
    return {created:false,reason:"invalid_checkout_request"};
  for (const value of [redirectUrl,webhookUrl]) {
    let url;
    try { url = new URL(value); }
    catch { return {created:false,reason:"invalid_callback_url"}; }
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      return {created:false,reason:"invalid_callback_url"};
  }
  const response = await fetcher("https://api.mollie.com/v2/payments",{
    method:"POST",redirect:"error",
    headers:{Authorization:"Bearer " + apiKey,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({
      amount:{currency:"EUR",value:monthlyGrossAmount(planCode)},
      description:"Bringness POS first month " + planCode,
      customerId,sequenceType:"first",
      redirectUrl,webhookUrl,
      metadata:{bringnessCompanyId:String(companyId),bringnessPlanCode:planCode}
    }),
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) return {created:false,reason:"provider_create_failed"};
  const payment = await response.json();
  if (!/^tr_[A-Za-z0-9]+$/.test(String(payment.id || "")) ||
      payment.customerId !== customerId || payment.mode !== "test" ||
      typeof payment._links?.checkout?.href !== "string")
    return {created:false,reason:"provider_response_mismatch"};
  return {created:true,paymentId:payment.id,checkoutUrl:payment._links.checkout.href};
}

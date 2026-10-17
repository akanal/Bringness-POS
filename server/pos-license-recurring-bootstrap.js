// Complete the initial Mollie authorization sequence in the isolated sandbox.
// This is a server-side function: callers must load trusted company/customer
// ownership from the database and serialize concurrent onboarding attempts.
import {verifySandboxFirstPayment} from "./pos-license-recurring-first-payment-verify.js";
import {verifySandboxRecurringMandate} from "./pos-license-recurring-mandate.js";
import {createSandboxMonthlySubscription} from "./pos-license-recurring-create.js";

export async function bootstrapSandboxMonthlySubscription({
  apiKey,paymentId,customerId,companyId,planCode,webhookUrl,fetcher=fetch
}) {
  const firstPayment=await verifySandboxFirstPayment({
    apiKey,paymentId,customerId,companyId,planCode,fetcher
  });
  if (!firstPayment.verified)
    return {created:false,stage:"first_payment",reason:firstPayment.reason};
  const mandate=await verifySandboxRecurringMandate({
    apiKey,customerId,firstPayment,fetcher
  });
  if (!mandate.ready)
    return {created:false,stage:"mandate",reason:mandate.reason};
  const subscription=await createSandboxMonthlySubscription({
    apiKey,customerId,companyId,planCode,webhookUrl,fetcher
  });
  if (!subscription.created)
    return {created:false,stage:"subscription",reason:subscription.reason};
  return {created:true,subscriptionId:subscription.subscriptionId,
    customerId,companyId,planCode,mandateId:mandate.mandateId,
    firstPaymentId:paymentId,status:subscription.status};
}

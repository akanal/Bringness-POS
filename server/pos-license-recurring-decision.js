// Pure decision layer for provider-verified recurring POS payments.
// This module does not grant entitlements or contact Mollie. Callers must
// verify the payment against Mollie's API and persist transitions atomically.
// EUR cents including 19% VAT, consistent with Mollie subscription creation.\nconst MONTHLY_PLANS = Object.freeze({
  online_pos: 3569,
  restaurant_module: 8329,
  qr_module: 3569,
});
export function decideMonthlyLicenseTransition({planCode, payment, subscription, companyId, previousPaymentIds = []}) {
  if (!Object.hasOwn(MONTHLY_PLANS, planCode)) return {action:"reject",reason:"unknown_plan"};
  if (!companyId || !subscription?.id || !payment?.id) return {action:"reject",reason:"missing_identity"};
  if (String(payment.metadata?.bringnessCompanyId) !== String(companyId) ||
      payment.metadata?.bringnessPlanCode !== planCode ||
      payment.subscriptionId !== subscription.id ||
      payment.customerId !== subscription.customerId) return {action:"reject",reason:"provider_identity_mismatch"};
  if (payment.amount?.currency !== "EUR" ||
      Math.round(Number(payment.amount.value) * 100) !== MONTHLY_PLANS[planCode])
    return {action:"reject",reason:"amount_mismatch"};
  if (previousPaymentIds.includes(payment.id)) return {action:"noop",reason:"already_processed"};
  if (payment.status === "paid" && subscription.status === "active")
    return {action:"renew",providerPaymentId:payment.id,providerSubscriptionId:subscription.id};
  if (["failed","canceled","expired"].includes(payment.status))
    return {action:"payment_failed",providerPaymentId:payment.id};
  return {action:"wait",reason:"not_confirmed_paid"};
}

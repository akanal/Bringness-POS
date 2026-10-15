// Pure, fail-closed provider confirmation for Bringness POS license purchases.
// This module does not change entitlements or initiate network requests.
export function verifyPosLicensePayment(payment, expected) {
  if (!payment || !expected) return { verified: false, reason: "missing_payment" };
  if (expected.mode !== "test" && expected.mode !== "live") return { verified: false, reason: "invalid_mode" };
  if (!/^tr_[A-Za-z0-9]+$/.test(String(expected.paymentId || "")) ||
      payment.id !== expected.paymentId) return { verified: false, reason: "payment_id_mismatch" };
  if (payment.status !== "paid") return { verified: false, reason: "not_paid" };
  if (payment.amount?.currency !== "EUR" || !/^\\d+\\.\\d{2}$/.test(String(payment.amount?.value || ""))) return { verified: false, reason: "invalid_amount" };
  const [euros, cents] = payment.amount.value.split(".");
  const paidCents = Number(euros) * 100 + Number(cents);
  if (!Number.isSafeInteger(paidCents) || paidCents !== expected.amountCents || paidCents <= 0) return { verified: false, reason: "amount_mismatch" };
  const metadata = payment.metadata || {};
  if (metadata.bringnessCompanyId !== expected.companyId ||
      metadata.bringnessPlanCode !== expected.planCode ||
      metadata.bringnessCheckoutId !== expected.checkoutId) return { verified: false, reason: "metadata_mismatch" };
  if (Boolean(payment.testmode) !== (expected.mode === "test")) return { verified: false, reason: "mode_mismatch" };
  if (typeof payment.paidAt !== "string" || !Number.isFinite(Date.parse(payment.paidAt))) return { verified: false, reason: "missing_paid_timestamp" };
  return { verified: true, paymentId: payment.id, companyId: expected.companyId, planCode: expected.planCode, checkoutId: expected.checkoutId };
}

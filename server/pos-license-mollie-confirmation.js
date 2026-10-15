import { verifyPosLicensePayment } from "./pos-license-payment-verification.js";

// Always read payment status directly from Mollie. Webhook payloads are untrusted.
export async function confirmPosLicenseWithMollie(paymentId, expected, apiKey, fetcher = fetch) {
  if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId || "")) || paymentId !== expected?.paymentId) {
    return { verified: false, reason: "invalid_payment_id" };
  }
  const key = String(apiKey || "");
  if (expected.mode === "test" ? !key.startsWith("test_") : expected.mode === "live" ? !key.startsWith("live_") : true) {
    return { verified: false, reason: "api_key_mode_mismatch" };
  }
  const response = await fetcher("https://api.mollie.com/v2/payments/" + paymentId, {
    method: "GET",
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return { verified: false, reason: "provider_read_failed" };
  const payment = await response.json();
  return verifyPosLicensePayment(payment, expected);
}

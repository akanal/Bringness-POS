import { confirmPosLicenseWithMollie } from "./pos-license-mollie-confirmation.js";
import { activateVerifiedPosLicense } from "./pos-license-entitlement.js";

// The checkout record must be retrieved from trusted storage, not from the
// callback body. A webhook ID is only a lookup hint, never payment evidence.
export async function processPosLicenseWebhook({ paymentId, lookupCheckout, pool, apiKey, fetcher }) {
  if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId || ""))) {
    return { activated:false, reason:"invalid_payment_id" };
  }
  const expected = await lookupCheckout(paymentId);
  if (!expected || expected.paymentId !== paymentId || expected.mode !== "test" ||
      expected.ownerEmailConfirmed !== true || expected.planCode !== "download_license") {
    return { activated:false, reason:"checkout_not_eligible" };
  }
  const confirmation = await confirmPosLicenseWithMollie(paymentId, expected, apiKey, fetcher);
  if (!confirmation.verified) return {activated:false,reason:confirmation.reason};
  return activateVerifiedPosLicense(pool, confirmation, expected);
}

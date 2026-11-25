import {deliverySandboxConfig} from './delivery-sandbox.js';
import {createMollieTestRefund} from './center-mollie-test-refund.js';
import {claimCenterTestRefund, recordCenterTestRefund} from './center-test-refund-journal.js';
import {withMerchantToken} from './center-mollie-merchant.js';
import {normalizeMolliePayment} from './center-mollie-payment.js';

export async function refundCenterTestOrder(db, {
  user, restaurantId, orderId, requestId, confirmed,
  env = process.env, fetcher = fetch
}) {
  const sandbox = deliverySandboxConfig(env);
  if (!sandbox || sandbox.restaurantId !== restaurantId ||
      env.CENTER_MOLLIE_MODE !== 'test' || env.BRINGNESS_DELIVERY_SANDBOX_REFUNDS !== 'true') {
    return {state: 'disabled'};
  }
  if (!['owner', 'admin'].includes(user?.role) || !user.company_id) return {state: 'forbidden'};
  if (confirmed !== true || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return {state: 'invalid_request'};
  }

  const merchant = await db.query(`SELECT p.payment_id, p.amount_cents, p.merchant_reference
    FROM center_order_payments p JOIN restaurants r ON r.id = p.restaurant_id
    JOIN center_checkout_attempts a ON a.payment_id = p.payment_id
      AND a.restaurant_id = p.restaurant_id AND a.order_id = p.order_id
    WHERE p.restaurant_id = $1 AND p.order_id = $2 AND r.company_id = $3
      AND p.payment_method = 'online' AND p.currency = 'EUR' AND p.paid_at IS NOT NULL
      AND p.released_at IS NOT NULL AND a.request_payload->'testmode' = 'true'::jsonb`,
  [restaurantId, orderId, user.company_id]);
  const binding = merchant.rows[0];
  if (!binding || !/^tr_[a-zA-Z0-9]+$/.test(binding.payment_id)) return {state: 'unavailable'};

  return withMerchantToken(db, restaurantId, async (accessToken, envelope) => {
    const {rows: [credential]} = await db.query(`SELECT profile_id, organization_id, verified_at
      FROM center_mollie_credentials WHERE restaurant_id = $1 AND token_envelope = $2`,
    [restaurantId, envelope]);
    if (!credential?.verified_at || credential.organization_id !== binding.merchant_reference) {
      return {state: 'unavailable'};
    }

    const response = await fetcher('https://api.mollie.com/v2/payments/' + binding.payment_id + '?testmode=true', {
      headers: {authorization: 'Bearer ' + accessToken},
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return {state: 'unavailable'};
    const raw = await response.json();
    const payment = normalizeMolliePayment(raw, credential);
    if (raw.mode !== 'test' || payment.paymentId !== binding.payment_id || payment.orderId !== orderId ||
        payment.amountCents !== binding.amount_cents || payment.status !== 'paid' ||
        payment.refundedCents || payment.chargedBackCents) return {state: 'unavailable'};

    const claim = await claimCenterTestRefund(db, {companyId: user.company_id, restaurantId, orderId, requestId});
    if (!claim) return {state: 'already_claimed'};
    if (claim.payment_id !== binding.payment_id || claim.amount_cents !== binding.amount_cents) {
      return {state: 'reconcile_required'};
    }

    const result = await createMollieTestRefund({
      restaurantId, paymentId: claim.payment_id, requestId, amountCents: claim.amount_cents,
      accessToken, env, fetcher
    });
    if (result.state === 'confirmed') {
      try {
        const saved = await recordCenterTestRefund(db, {
          paymentId: claim.payment_id, requestId, refundId: result.refundId, providerStatus: result.providerStatus
        });
        if (!saved) return {state: 'reconcile_required'};
      } catch {
        return {state: 'reconcile_required'};
      }
    }
    return result;
  }, env, fetcher);
}

import {deliverySandboxConfig} from './delivery-sandbox.js';
import {providerEuroCents} from './provider-money.js';

export async function createMollieTestRefund({
  restaurantId, paymentId, requestId, amountCents, accessToken,
  env = process.env, fetcher = fetch
}) {
  const sandbox = deliverySandboxConfig(env);
  if (!sandbox || sandbox.restaurantId !== restaurantId ||
      env.CENTER_MOLLIE_MODE !== 'test' || env.BRINGNESS_DELIVERY_SANDBOX_REFUNDS !== 'true') {
    throw Error('TEST_REFUNDS_DISABLED');
  }
  if (!/^tr_[a-zA-Z0-9]+$/.test(paymentId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
      !Number.isSafeInteger(amountCents) || amountCents < 1 || !accessToken) {
    throw Error('INVALID_TEST_REFUND');
  }

  const value = Math.floor(amountCents / 100) + '.' + String(amountCents % 100).padStart(2, '0');
  try {
    const response = await fetcher('https://api.mollie.com/v2/payments/' + paymentId + '/refunds', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + accessToken,
        'content-type': 'application/json',
        'idempotency-key': requestId
      },
      body: JSON.stringify({
        amount: {currency: 'EUR', value},
        metadata: {bringnessRefundRequestId: requestId},
        testmode: true
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    if (response.status !== 201) throw Error('REFUND_RESPONSE_UNVERIFIED');

    const refund = await response.json();
    if (!/^re_[a-zA-Z0-9]+$/.test(refund.id) || refund.paymentId !== paymentId ||
        refund.mode !== 'test' || providerEuroCents(refund.amount) !== amountCents ||
        refund.metadata?.bringnessRefundRequestId !== requestId ||
        !['queued', 'pending', 'processing', 'refunded', 'failed', 'canceled'].includes(refund.status)) {
      throw Error('REFUND_RESPONSE_UNVERIFIED');
    }
    return {state: 'confirmed', refundId: refund.id, providerStatus: refund.status};
  } catch {
    // A lost or mismatched result must be reconciled before a caller permits another POST.
    return {state: 'reconcile_required'};
  }
}

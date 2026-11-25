export async function migrateCenterTestRefundJournal(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS center_test_refund_requests (
    payment_id text PRIMARY KEY REFERENCES center_order_payments(payment_id),
    request_id uuid NOT NULL UNIQUE,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    refund_id text UNIQUE,
    provider_status text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((refund_id IS NULL) = (provider_status IS NULL))
  )`);
}

// Only the caller that inserts a row may contact Mollie. A committed row
// without a provider result stays blocked until the original request is reconciled.
export async function claimCenterTestRefund(db, {companyId, restaurantId, orderId, requestId}) {
  const {rows} = await db.query(`INSERT INTO center_test_refund_requests (payment_id, request_id, amount_cents)
    SELECT payment.payment_id, $4, payment.amount_cents
    FROM center_order_payments payment
    JOIN restaurants restaurant ON restaurant.id = payment.restaurant_id
    JOIN center_checkout_attempts attempt ON attempt.payment_id = payment.payment_id
      AND attempt.order_id = payment.order_id AND attempt.restaurant_id = payment.restaurant_id
    WHERE restaurant.company_id = $1 AND restaurant.id = $2 AND payment.order_id = $3
      AND payment.payment_method = 'online' AND payment.currency = 'EUR'
      AND payment.paid_at IS NOT NULL AND payment.released_at IS NOT NULL
      AND attempt.request_payload->'testmode' = 'true'::jsonb
    ON CONFLICT DO NOTHING
    RETURNING payment_id, request_id, amount_cents`, [companyId, restaurantId, orderId, requestId]);
  return rows[0] ?? null;
}

export async function recordCenterTestRefund(db, {paymentId, requestId, refundId, providerStatus}) {
  const result = await db.query(`UPDATE center_test_refund_requests
    SET refund_id = $3, provider_status = $4
    WHERE payment_id = $1 AND request_id = $2 AND refund_id IS NULL`,
  [paymentId, requestId, refundId, providerStatus]);
  return result.rowCount === 1;
}

// Persist a previously Mollie-verified renewal in the isolated sandbox only.
// The caller supplies a provider-confirmed billing period end; never infer it
// from an untrusted webhook or add a month to the server clock.
export async function persistVerifiedMonthlyRenewal(pool, {
  companyId, planCode, subscriptionId, paymentId, paidThrough, decision
}) {
  if (decision?.action !== "renew" || decision.providerPaymentId !== paymentId ||
      decision.providerSubscriptionId !== subscriptionId)
    return {renewed:false,reason:"provider_confirmation_required"};
  const until = new Date(paidThrough);
  if (!Number.isFinite(until.getTime()) || until <= new Date())
    return {renewed:false,reason:"invalid_paid_through"};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id,paid_through FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 AND plan_code=$2 AND mollie_subscription_id=$3 FOR UPDATE",
      [companyId,planCode,subscriptionId]
    );
    if (found.rowCount !== 1) {
      await client.query("ROLLBACK");
      return {renewed:false,reason:"subscription_not_registered"};
    }
    const record = found.rows[0];
    const inserted = await client.query(
      "INSERT INTO sandbox_pos_monthly_payments(mollie_payment_id,subscription_id,payment_status) VALUES($1,$2,'paid') ON CONFLICT (mollie_payment_id) DO NOTHING RETURNING mollie_payment_id",
      [paymentId,record.id]
    );
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return {renewed:false,alreadyProcessed:true};
    }
    // Never shorten an already-paid period.
    await client.query(
      "UPDATE sandbox_pos_monthly_subscriptions SET status='active',paid_through=GREATEST(COALESCE(paid_through,'-infinity'::timestamptz),$2::timestamptz),updated_at=now() WHERE id=$1",
      [record.id,until.toISOString()]
    );
    await client.query("COMMIT");
    return {renewed:true};
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

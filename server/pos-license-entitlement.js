// Isolated, idempotent POS entitlement writer. Caller must first verify the
// payment with Mollie and check owner email confirmation.
export async function activateVerifiedPosLicense(pool, confirmation, expected) {
  if (!confirmation?.verified || confirmation.paymentId !== expected?.paymentId ||
      confirmation.companyId !== expected.companyId ||
      confirmation.planCode !== expected.planCode ||
      confirmation.checkoutId !== expected.checkoutId ||
      expected.ownerEmailConfirmed !== true) {
    return { activated: false, reason: "confirmation_required" };
  }
  if (expected.planCode !== "download_license") return {activated:false,reason:"recurring_billing_not_implemented"};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent callbacks for the same Mollie reference.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [expected.paymentId]);
    // Never write without a database-enforced unique provider reference.
    const constraint = (await client.query(
      "SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attname='provider_reference' WHERE n.nspname=current_schema() AND t.relname='company_entitlements' AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum LIMIT 1"
    )).rows[0];
    if (!constraint) { await client.query("ROLLBACK"); return {activated:false,reason:"unique_payment_constraint_missing"}; }
    const checkout = (await client.query(
      "SELECT company_id,plan_code,checkout_id,amount_cents,owner_email_confirmed_at FROM sandbox_pos_license_checkouts WHERE payment_id=$1 FOR UPDATE",
      [expected.paymentId]
    )).rows[0];
    if (!checkout || String(checkout.company_id) !== expected.companyId ||
        checkout.plan_code !== expected.planCode || checkout.checkout_id !== expected.checkoutId ||
        Number(checkout.amount_cents) !== expected.amountCents || !checkout.owner_email_confirmed_at) {
      await client.query("ROLLBACK");
      return {activated:false,reason:"checkout_state_changed"};
    }
    const plan = (await client.query(
      "SELECT id FROM billing_plans WHERE code=$1 AND active=true FOR SHARE",
      [expected.planCode]
    )).rows[0];
    if (!plan) { await client.query("ROLLBACK"); return {activated:false,reason:"plan_not_found"}; }
    // The provider reference is unique within this purchase path. A replay must
    // never issue a second entitlement for the same Mollie payment.
    const existing = (await client.query(
      "SELECT id,company_id,plan_id FROM company_entitlements WHERE provider_reference=$1 FOR UPDATE",
      [expected.paymentId]
    )).rows[0];
    if (existing) {
      await client.query("COMMIT");
      return String(existing.company_id) === expected.companyId && String(existing.plan_id) === String(plan.id)
        ? {activated:true,alreadyActive:true,entitlementId:existing.id}
        : {activated:false,reason:"payment_reference_conflict"};
    }
    // A one-off entitlement is not a recurring subscription. Do not activate
    // monthly plans until recurring billing and expiry are implemented.
    if (expected.planCode !== "download_license") { await client.query("ROLLBACK"); return {activated:false,reason:"recurring_billing_not_implemented"}; }
    const result = await client.query(
      "INSERT INTO company_entitlements(company_id,plan_id,status,provider_reference,purchased_at) VALUES($1,$2,'active',$3,now()) RETURNING id",
      [expected.companyId,plan.id,expected.paymentId]
    );
    await client.query("COMMIT");
    return {activated:true,alreadyActive:false,entitlementId:result.rows[0].id};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

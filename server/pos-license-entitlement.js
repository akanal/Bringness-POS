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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent callbacks for the same Mollie reference.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [expected.paymentId]);
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
      return existing.company_id === expected.companyId && existing.plan_id === plan.id
        ? {activated:true,alreadyActive:true,entitlementId:existing.id}
        : {activated:false,reason:"payment_reference_conflict"};
    }
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

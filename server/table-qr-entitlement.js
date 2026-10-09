// Pure, fail-closed QR add-on entitlement check. No payment action is performed here.
export function canUseTableQr(entitlement, now = new Date()) {
  if (!entitlement || entitlement.feature_code !== 'table_qr') return false;
  if (entitlement.status !== 'active' || entitlement.payment_status !== 'ok') return false;
  const start = new Date(entitlement.starts_at);
  if (!Number.isFinite(start.getTime()) || start > now) return false;
  if (entitlement.ends_at != null) {
    const end = new Date(entitlement.ends_at);
    if (!Number.isFinite(end.getTime()) || end <= now) return false;
  }
  return true;
}

// Always resolve by the authenticated company's ID, never by client-supplied company IDs.
export async function requireTableQr(pool, companyId, now = new Date()) {
  if (!companyId) return false;
  const { rows } = await pool.query(
    `SELECT feature_code,status,payment_status,starts_at,ends_at
       FROM company_features WHERE company_id=$1 AND feature_code='table_qr' LIMIT 1`,
    [companyId]
  );
  return canUseTableQr(rows[0], now);
}

import { createHash, randomBytes } from "node:crypto";

// This token must only be delivered to the stored owner's mailbox by a
// trusted mail transport. Never return it in a public checkout response.
export async function issueOwnerConfirmation(pool, paymentId) {
  if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId || ""))) throw Error("invalid_payment_id");
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    "UPDATE sandbox_pos_license_checkouts SET owner_token_hash=$2,owner_token_expires_at=now()+interval '30 minutes' WHERE payment_id=$1 AND owner_email_confirmed_at IS NULL RETURNING owner_email",
    [paymentId, hash]
  );
  if (result.rowCount !== 1) throw Error("checkout_not_found_or_confirmed");
  return { ownerEmail: result.rows[0].owner_email, token };
}

// Atomic one-time consumption. A GET request must never invoke this method.
export async function confirmOwnerEmail(pool, paymentId, token) {
  if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId || "")) ||
      !/^[a-f0-9]{64}$/.test(String(token || ""))) return false;
  const hash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    "UPDATE sandbox_pos_license_checkouts SET owner_email_confirmed_at=now(),owner_token_hash=NULL,owner_token_expires_at=NULL WHERE payment_id=$1 AND owner_token_hash=$2 AND owner_token_expires_at>now() AND owner_email_confirmed_at IS NULL RETURNING payment_id",
    [paymentId, hash]
  );
  return result.rowCount === 1;
}

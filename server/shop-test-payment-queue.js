export async function migrateShopTestPaymentQueue(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_test_payment_queue(
  checkout_id uuid PRIMARY KEY REFERENCES shop_checkout_orders(id),
  provider_payment_id text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','done','review')),
  version bigint NOT NULL DEFAULT 1,claimed_version bigint,
  attempts int NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,lease_until timestamptz,last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS shop_test_payment_due ON shop_test_payment_queue(state,next_at)');
}
// Caller can be the verified attachment transaction or the callback receiver.
// Unknown/unverified/LIVE IDs do not create rows and never cause provider lookups.
export async function enqueueShopTestPayment(db,paymentId){
 await db.query(`INSERT INTO shop_test_payment_queue(checkout_id,provider_payment_id)
  SELECT id,provider_payment_id FROM shop_checkout_orders WHERE provider_payment_id=$1 AND provider_mode='test'
  ON CONFLICT(checkout_id) DO UPDATE SET version=shop_test_payment_queue.version+1,
  state=CASE WHEN shop_test_payment_queue.state='done' THEN 'pending' ELSE shop_test_payment_queue.state END,
  attempts=CASE WHEN shop_test_payment_queue.state='done' THEN 0 ELSE shop_test_payment_queue.attempts END,
  next_at=CASE WHEN shop_test_payment_queue.state='done' THEN clock_timestamp() ELSE shop_test_payment_queue.next_at END`,[paymentId]);
}

-- Isolated recurring billing storage. Apply only to a dedicated sandbox database.
-- Every Mollie payment is unique, even across multiple subscription renewals.
CREATE TABLE IF NOT EXISTS sandbox_pos_monthly_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('online_pos','restaurant_module','qr_module')),
  mollie_customer_id TEXT NOT NULL,
  mollie_subscription_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','canceled','expired')),
  paid_through TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id,plan_code)
);
CREATE TABLE IF NOT EXISTS sandbox_pos_monthly_payments (
  mollie_payment_id TEXT PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES sandbox_pos_monthly_subscriptions(id),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','failed','canceled','expired')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sandbox_pos_monthly_payments_subscription_idx
  ON sandbox_pos_monthly_payments(subscription_id);

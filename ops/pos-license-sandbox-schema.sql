-- Dedicated sandbox-only checkout registry. Never apply to production.
CREATE TABLE IF NOT EXISTS sandbox_pos_license_checkouts (
  payment_id text PRIMARY KEY CHECK (payment_id ~ '^tr_[A-Za-z0-9]+$'),
  company_id uuid NOT NULL REFERENCES companies(id),
  plan_code text NOT NULL CHECK (plan_code = 'download_license'),
  checkout_id text NOT NULL UNIQUE,
  owner_email text NOT NULL CHECK (length(trim(owner_email)) > 3),
  amount_cents integer NOT NULL CHECK (amount_cents = 39900),
  owner_email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Checkout rows must be created by a trusted purchase flow, never by webhooks.

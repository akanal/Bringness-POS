-- Apply ONLY to an existing, isolated bringness_billing_sandbox database.
-- PostgreSQL docker-entrypoint-initdb.d is NOT replayed on existing volumes.
-- This additive migration is intentionally idempotent.
BEGIN;
DO $$
BEGIN
 IF current_database() <> 'bringness_billing_sandbox' THEN
  RAISE EXCEPTION 'Refusing to modify a non-sandbox database';
 END IF;
END $$;
ALTER TABLE sandbox_pos_license_checkouts
 ADD COLUMN IF NOT EXISTS owner_token_hash text;
ALTER TABLE sandbox_pos_license_checkouts
 ADD COLUMN IF NOT EXISTS owner_token_expires_at timestamptz;
ALTER TABLE sandbox_pos_license_checkouts
 ADD COLUMN IF NOT EXISTS owner_email_confirmed_at timestamptz;
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
CREATE SEQUENCE IF NOT EXISTS sandbox_pos_invoice_number_seq;
CREATE TABLE IF NOT EXISTS sandbox_pos_monthly_invoice_drafts (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 mollie_payment_id TEXT NOT NULL UNIQUE REFERENCES sandbox_pos_monthly_payments(mollie_payment_id),
 company_id TEXT NOT NULL,
 plan_code TEXT NOT NULL CHECK(plan_code IN ('online_pos','restaurant_module','qr_module')),
 invoice_number TEXT NOT NULL UNIQUE,
 invoice_date DATE NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'),
 net_cents INTEGER NOT NULL CHECK(net_cents>0),
 vat_cents INTEGER NOT NULL CHECK(vat_cents>=0),
 gross_cents INTEGER NOT NULL CHECK(gross_cents=net_cents+vat_cents),
 customer_billing JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sandbox_pos_monthly_invoice_drafts
 DROP CONSTRAINT IF EXISTS sandbox_pos_monthly_invoice_drafts_status_check;
ALTER TABLE sandbox_pos_monthly_invoice_drafts
 ADD CONSTRAINT sandbox_pos_monthly_invoice_drafts_status_check CHECK(status IN ('draft','issued'));
ALTER TABLE sandbox_pos_monthly_invoice_drafts ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE sandbox_pos_monthly_invoice_drafts ADD COLUMN IF NOT EXISTS issued_details JSONB;
COMMIT;

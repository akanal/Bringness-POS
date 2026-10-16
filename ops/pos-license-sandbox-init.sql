-- Standalone billing-only database schema. Apply only to isolated sandbox DB.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO billing_plans(code) VALUES ('download_license')
ON CONFLICT (code) DO NOTHING;
CREATE TABLE IF NOT EXISTS company_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  plan_id uuid NOT NULL REFERENCES billing_plans(id),
  status text NOT NULL CHECK (status IN ('active','inactive')),
  provider_reference text NOT NULL UNIQUE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sandbox_pos_license_checkouts (
  payment_id text PRIMARY KEY CHECK (payment_id ~ '^tr_[A-Za-z0-9]+$'),
  company_id uuid NOT NULL REFERENCES companies(id),
  plan_code text NOT NULL CHECK (plan_code = 'download_license'),
  checkout_id text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents = 39900),
  owner_email text NOT NULL CHECK (length(trim(owner_email)) > 3),
  owner_email_confirmed_at timestamptz,
  owner_token_hash text,
  owner_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Embedded from db/sandbox-pos-monthly-subscriptions.sql for new isolated database volumes.
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


-- Embedded from db/sandbox-pos-monthly-invoices.sql for new isolated database volumes.
-- Run only on the isolated sandbox database. Never on production.
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
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued')),
 issued_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


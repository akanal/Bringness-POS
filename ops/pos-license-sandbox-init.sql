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
  owner_email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

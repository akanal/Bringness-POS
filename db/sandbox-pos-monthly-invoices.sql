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
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

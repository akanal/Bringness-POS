-- Sandbox-only migration. Apply ONLY to isolated sandbox database.
ALTER TABLE sandbox_pos_monthly_invoice_drafts
 DROP CONSTRAINT IF EXISTS sandbox_pos_monthly_invoice_drafts_status_check;
ALTER TABLE sandbox_pos_monthly_invoice_drafts
 ADD CONSTRAINT sandbox_pos_monthly_invoice_drafts_status_check
 CHECK (status IN ('draft','issued'));
ALTER TABLE sandbox_pos_monthly_invoice_drafts
 ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;

ALTER TABLE sandbox_pos_monthly_invoice_drafts
 ADD COLUMN IF NOT EXISTS issued_details JSONB;

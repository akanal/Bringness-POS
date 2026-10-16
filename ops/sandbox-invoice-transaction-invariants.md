# Invoice issuance transaction invariants (sandbox)

- Paid Mollie payment must belong to the same company subscription.
- Existing draft reuse must match company and plan; never return another tenant's invoice number.
- Issued invoices require a persisted issued_details snapshot; missing snapshot is an error, not a successful idempotent retry.
- Draft-to-issued UPDATE must affect exactly one row before COMMIT.
- HTML, print, and JSON exports require issued status, company scope, valid snapshot, and EUR.
- Do not deploy to production or trigger real payments before the general test.
- Automated regression tests have not been run in this development batch.

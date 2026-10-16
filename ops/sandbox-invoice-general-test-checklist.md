# Sandbox invoice export verification checklist

Development branch only. Do not use live Mollie credentials or real payments.

1. Verify payment reconciliation only accepts Mollie status `paid` and matches the company subscription.
2. Confirm the invoice stays a draft until explicit issuance and compliance approval.
3. Confirm issued snapshot includes ISO dates, EUR, issuer and buyer, service period, and consistent 19% VAT totals.
4. Confirm HTML, A4 print, and JSON exports are available only for the owning company and issued invoices.
5. In the later general test, render an invoice in a browser and manually inspect print preview and Save as PDF on A4, including long customer names.
6. Do not describe JSON as XRechnung, ZUGFeRD, or EN16931 compliant.

Automated tests were authored but not run in this development batch. A rendered PDF and live payment receipt have not been verified.

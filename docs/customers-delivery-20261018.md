# Customers and outgoing delivery notes — 2026-10-18

Implemented on a separate branch; not deployed. The earlier trade-toggle deployment remains postponed following two SSH connection timeouts.

- More → Kunden & Lieferscheine works independently of the wholesale toggle. Saved customer addresses have optional email/phone, literal name/city search, versioned editing and per-restaurant isolation.
- Wholesale checkout can reuse stored customer addresses. The existing cash checkout, ordinary receipt and A4 invoice logic is preserved.
- Outgoing delivery notes snapshot the sender billing address, recipient, active catalog item names and quantities. Explicit creation is independent of payment and never creates an order, sale, receipt or inventory movement. Archive and A4 browser printing are available; printing supports browser Save as PDF.
- Missing sender billing address blocks issuance. Document identifiers use unique LS-prefixed UUIDs, not invoice numbers. Notes have no monetary total or paid status.
- Lost responses retain the exact request in local storage. A per-restaurant/request transaction lock and unique constraint return one immutable document on retry, including after catalog changes. Reusing a key with different content returns 409.
- Owners/admins/managers only; authentication and company scope are rechecked within the transaction. Customer edits use optimistic versions. No deletion endpoint, mail sending or third-party sharing added.

Validation: 512 unit tests; PGlite customer/delivery integration and UI recovery/print escaping tests; existing checkout recovery, discount/parking, trade checkout/PDF, trade UI/toggle and transactional-mail tests passed locally. PostgreSQL 16 concurrency is configured in CI and must pass before publication.

Limitations: online only; browser printing instead of a server-generated PDF; no stock dispatch workflow, delivery tracking, conversion of a delivery note into an invoice or automatic invoice linkage. Existing notes stay immutable through these APIs. Customer search/archive returns at most 200 matches per request. Deposit/returns, cash closing and reporting remain open.

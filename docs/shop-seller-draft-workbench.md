# Marketplace seller workbench — 2026-10-26

New seller.html is linked from the marketplace navigation, supplier section and help. It supports general physical goods, digital goods and services through the shared fifteen-department taxonomy.

Implemented in this block:
- Session-local offer list with search and edit selection.
- Separate physical inventory/delivery and digital/service fulfilment fields.
- Bounded title, description, SKU and optional GTIN with checksum validation.
- Integer cents from bounded decimal price; explicit 19/7/0 percent or unresolved tax, draft-only gross display. No tax treatment inferred from category.
- Create, update and duplicate with a fifty-offer cap.
- Confirmed deletion, unsaved-change prompt and form state retained on failed storage writes.
- Text-only preview (no HTML interpretation of imported or authored data).
- Versioned JSON export and bounded, validated import as new copies without replacement; entire import validated before any write.
- Storage-read failure disables writes over the unreadable original data; in-memory work remains exportable.
- Accessible labels, live status, required fields, responsive editor and navigation back to marketplace/account.

Scope: a preparation workspace, not authenticated seller persistence or publication. Data is per browser tab/session and contains only authored product descriptions; no customer data, uploads, external image requests, sales, shipping orders or payment actions. Browser session restoration can retain sessionStorage; the page promises no server/account persistence.

Syntax checks passed for offer-drafts.js, seller-page.js and help-content.js. Owner deferred functional, browser, workflow, database and payment tests; these were not run. Next integration requires authenticated company-scoped persistence, seller verification, moderation, physical-order inventory reservation and fulfilment policy, and separate approved settlement. Existing software checkout is untouched.

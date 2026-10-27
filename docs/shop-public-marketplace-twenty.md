# Public merchant offers and order handoff — 2026-10-27

Built on the exact tree of `fix/shop-seller-recovery-20261027` at
`f36b4330225d187df61dfb1cb1873c786ed1d300`; prior customer/recovery fixes retained.
This package implements public physical merchandise independently of the existing
Bringness licence cart, billing, providers, POS, waiter and AI applications.

## Twenty connected implementation areas

1. Separate `shop_market_sellers` approval boundary; active company owner/admin
   session plus an approved business is mandatory. No automatic seller approval.
2. Explicit private-draft selection and source-revision binding.
3. Publication snapshot contains only validated public product information.
4. Publication retains the database-assigned immutable advertisement number.
5. Optimistic publication revisions prevent stale edits/restocking.
6. Explicit publish/update/withdraw commands have durable idempotency receipts.
7. Archiving a draft withdraws its publication in the same transaction; restoring
   the draft never silently republishes it. Ordinary private edits stay private.
8. Public catalogue/search/category/pagination returns only published offers from
   currently approved businesses; seller contacts come from their business profile.
9. Up to twenty uniquely identified variants with explicit prices and VAT rates.
10. Real remaining variant quantities, with sold-out selection disabled.
11. Explicit shipping availability, delivery text, shipping net fee and VAT.
12. Explicit pickup availability/address; pickup carries no shipping fee.
13. Customer product details render as text, including hostile HTML strings.
14. Separate merchandise selection, one merchant per order, with reload persistence.
15. Quantity edits/removal, invalid pending input protection and storage feedback.
16. Server-side cent-exact quote revalidates identity, revision, price, availability,
    stock and delivery. Different shipping policies require separate orders.
17. Explicit authenticated recipient/contact handoff with an unpaid status.
18. One transaction saves an immutable merchant order and deducts available stock;
    any failure rolls both back. No provider, invoice or licence write occurs.
19. Account-bound uncertain-request persistence, explicit identical retry and
    read-only order recovery; no automatic resubmission after a lost reply.
20. Scoped merchant inbox and native browser acceptance at 390/768/1280 widths,
    including lost committed reply/retry and exactly-once stock deduction.

## Integration and release boundary

`SHOP_MARKETPLACE_ENABLED=true` opts the POS web process into migration and routing.
Default is disabled; AI is excluded. A migration failure keeps routes closed.
The Shop entry links to `/shop/marketplace.html`; saved drafts link to
`/shop/marketplace-seller.html`. Public advertisement lookup is also supported by
`/shop/marketplace.html?ad=<number>`; private drafts remain undiscoverable.

Approved businesses must be provisioned through an authorized administrative
process with verified public business profiles. This package does not invent
verification, bulk-approve existing customers, or add a self-approval endpoint.
No production seller approval, order or configuration was written.

The handoff is explicitly **unpaid**. Stock is deducted as committed ordered
quantity, not as a payment confirmation. Automatic expiry/release, merchant
accept/reject/shipment workflows, refunds, real payment settlement, legal seller
onboarding, physical delivery, public seller image uploads and provider integration
are separate follow-up work. Only physical goods with explicit tax are publishable;
digital/service drafts and tax-review drafts stay private. Online merchandise
payments and the existing licence payment gate remain unchanged.

The merchant inbox is bounded to the latest fifty orders; public offer pages contain
twenty-five rows. Browser request receipts use account-hashed session keys, never
tokens; order contact data remains in the same-tab recovery command until a
confirmed response. Account/page privacy changes suppress late acknowledgements
and clear visible contact/inbox fields. Immutable historical order records remain.

## Verification

- Full local suite: 620 checks passed before five additional account/replay client
  checks were added; final focused service/client run: all 15 passed.
- Native Chromium with disposable PGlite and production-Origin requests forwarded
  exclusively to loopback passed publication, quantity/reload, failed committed
  response/retry, stock, inbox and withdrawal at 390/768/1280. All six screenshots
  were generated; buyer mobile and seller desktop inspected.
- The actual-entrypoint PostgreSQL/Chrome workflow also includes this full browser
  journey plus parallel last-unit competition and concurrent same-request replay.
  Record its returned result before claiming PostgreSQL concurrency acceptance.
- No deployment, productive payment, handset acceptance or real merchant approval
  is implied by source commits or isolated fixtures.

Initial remote application/test head `c02e62e2243f6f9a694e1944dc0a058b65850dcf`
passed Shop run40559466141/job122384271053: all625 checks, zero failures/skips,
then actual-entrypoint PostgreSQL/Chrome including this three-width journey and
concurrent last-unit/same-request acceptance. Independent isolated POS/AI
run40559466349 also passed runtime/browser/network-fence/encrypted-backup/restore.
Subsequent refinements use euro inputs, preserve/clear reviewed totals correctly,
bound corrupt-cart input and clarify that cloud rows are private working drafts.
Final-head verification must still be recorded separately.

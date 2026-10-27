# Merchant order processing

This package builds on unmerged PR #163. It processes existing unpaid marketplace handoffs. No payment, invoice, delivery provider, merge or deployment is performed.

## Twenty connected areas

1. Existing company-scoped last-50 merchant inbox includes current status and revision.
2. Original recipient, prices, taxes, quantities and delivery snapshot stay immutable.
3. Separate versioned state starts at revision zero for existing received orders.
4. Received orders can explicitly be accepted.
5. Only received orders can be rejected.
6. Received, accepted and pickup-ready orders can be cancelled.
7. Only accepted pickup orders can become ready for pickup.
8. Only accepted shipping orders can be marked shipped.
9. Rejected/cancelled/shipped orders are terminal in this package.
10. New handoffs atomically retain immutable publication/SKU/quantity allocations.
11. Rejection/cancellation returns original allocated quantities in the status transaction.
12. Missing historical references, removed variants or stock overflow fail without partial restoration.
13. Restoration advances publication revisions, invalidating stale carts; withdrawn offers remain withdrawn.
14. Durable account-bound command receipts replay lost results without another stock return.
15. Company/order locks and sorted publication locks serialize competing commands.
16. Immutable events retain status revision, actor and database timestamp.
17. Explicit protected last-50 customer history shows only own-company order status.
18. Merchant UI offers contextual actions, confirmation, single-flight writes and explicit identical retry.
19. Account/hidden/page changes clear private views; failed refresh labels old data; no automatic replay.
20. Connected service, UI and native 390/768/1280 journeys cover cancellation, pickup, shipment and lost replies; real PostgreSQL concurrent cancellation is added to CI.

## Rules and limits

Received -> accepted/rejected/cancelled. Accepted -> ready_for_pickup (pickup), shipped (shipping), or cancelled. Ready_for_pickup -> cancelled. Shipped/rejected/cancelled have no outgoing transition here. Every state remains paymentStatus=unpaid and canPay=false. Shipped is a merchant declaration, not carrier, delivery or payment proof. No receipts, licences, fiscal sales, mail, charges, refunds, labels or carrier calls.

Status writes require active owner/admin membership, the original approved seller, exact expected revision, exact fields and own Origin. Customer reads use company authorization, never public order ID or recipient email. Original orders, allocations and event rows reject UPDATE/DELETE. Replaying an old successful command returns its original receipt; the UI requests a fresh list explicitly for latest state.

Earlier handoffs did not retain original publication/SKU mappings. They may be accepted/prepared/shipped, but reject/cancel fails with STOCK_RESTORE_REQUIRED pending authorized reconciliation. Never infer stock mappings from display names. Removed SKU or capacity overflow likewise requires review. Stock remains current available quantities, not a warehouse accounting ledger. No automatic expiry, collection/delivery confirmation, refunds or full paginated archive. No automatic polling or push. Seller approval/provisioning and productive activation remain separate.

## Verification

Application/test head `6a3cfeef9422e0818c4d5b4df5dbcd868dae07e8` passed all three applicable workflows:

- Shop run40566719695/job122409842571:646 tests, zero failures/cancellations/skips; actual application entrypoint with PostgreSQL16 and native Chrome passed. Includes concurrent last-unit ordering, simultaneous identical cancellation, exact-once stock restoration and stale competing cancellation rejection.
- Native merchant/customer journeys at390/768/1280 cover acceptance, cancellation, a lost committed cancellation reply, customer status, pickup readiness/cancellation and shipment. Screenshots artifact12764155842; final local mobile status and seller layouts visually reviewed. The existing empty committed cart reload warning was fixed and regression checked.
- POS/AI completion run40566719806 and isolated runtime/browser/network-fence/encrypted-backup+restore run40566719816 passed.

Local application/test tree `ca6cf0b97343e7bf1e8bdb3b287d0c6b02aa0e46` matches the tested remote source tree. Subsequent verification-record changes are documentation only. All fixtures use disposable databases; canonical-Origin browser interception forwards solely to loopback. No production account, merchant, order, secret, provider or financial fixture. No merge or deployment.

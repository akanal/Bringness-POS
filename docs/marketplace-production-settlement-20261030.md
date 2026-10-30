# Productive settlement continuation — 30 October 2026

Owner requested completing the next ten production-prerequisite points and releasing only independently verified work. This extends the deployed PR187 without changing its TEST mode, protected configuration, UI, provider credentials or actual payments.

## Implemented independent work

`shop-payment-marketplace-settlement.js` is an internal, disabled-by-default integration primitive. It is deliberately not imported by production startup or HTTP. Its migration is likewise not run on production. No new public API or live payment creation/refund initiation is introduced.

- Fresh trusted server-side LIVE payment proof is bound to original seller company, order, organization, profile and immutable connection revision. TEST proof is rejected.
- Durable merchant, accounting, fiscal and fulfilment acceptance must match the exact canonical order digest and binding. These inputs must come from protected server integrations, never browser flags. Missing integrations disable the service.
- Original net/VAT/gross totals and line arithmetic are checked again. Fees are recorded separately only when the provider supplies them; unknown fees remain null, never guessed or subtracted from revenue.
- Immutable settlement and refund rows, unique provider references and an atomic handoff reservation prevent partial accounting/receipt writes. Repeat settlement reuses the same record. Refunds are GET-reconciled, never initiated here; partial/full refunds cannot exceed confirmed refunded/paid amounts.
- Refunds block unused handoffs. Refunds after consumption explicitly require fulfilment review; no inventory restoration, shipment cancellation or credit-note issuance is invented.
- Consumption requires fresh proof and acceptance, exact unchanged order digest, no refund/chargeback and one unique durable receipt. Same receipt can replay; a different receipt cannot consume the order again. This is a database acknowledgement, not an exactly-once external network-delivery guarantee. The downstream receiver must durably deduplicate the receipt.
- Existing order-state writes are guarded for orders with live journal entries. A separate accepted fulfilment integration must own actual state transitions; the ordinary unpaid-order route cannot bypass paid/refund controls.
- Provider failures and timeouts occur before transactions and return fixed errors. Company/seller state and binding are checked again after provider I/O; order locks serialize against existing cancellation paths. Trusted binding/acceptance callbacks receiving the transaction client must take the appropriate shared locks and use it for their reads; their administrative writers must use matching locks/revisions. No provider HTTP belongs inside these transactions.

## Ten-point status and exact blockers

| Point | Result |
|---|---|
| 1 Existing Mollie configuration/approval | Existing test composition/acceptance report preserved. Plugin search found no Mollie account-management plugin. Browser opened the actual Mollie dashboard login; no signed-in account available. Protected host settings cannot be read/changed through the restricted SSH operation. |
| 2 Merchant/restaurant/profile | New primitive binds stored company/order and provider organization/profile/revision; legal restaurant ownership still requires actual merchant acceptance. |
| 3 Callback/webhooks | Existing exact HTTPS checks preserved; actual provider-dashboard registration cannot be verified before secure account sign-in. |
| 4 Merchant acceptance | Existing ordered checklist retained. No acceptance fabricated from tests. |
| 5 Productive payment recording | Internal settlement journal implemented with original-order/tax consistency and immutable provider attribution; no production host/HTTP activation. |
| 6 Fees/refunds/fiscal | Confirmed fees and refund journal implemented. Actual fiscal receipt/credit-note/DATEV connection and provider fee retrieval remain missing trusted integrations; unknown values are not invented. |
| 7 Handoff/goods release | Unique atomic reservation and receipt consumption implemented; downstream idempotent kitchen/shipping receiver and productive state transition remain unconnected. |
| 8 Failure/repetition/concurrency | PGlite rollback, mismatch, revocation, timeout/refund/replay tests plus dedicated real PostgreSQL concurrent settlement/receipt/refund CI. Final results recorded in PR/handoff. |
| 9 End-to-end | Local isolated tests cover the new primitive; no authenticated real merchant/provider/fiscal end-to-end acceptance is possible yet. |
| 10 Publication | Verify applicable CI before saving/releasing. Publishing dormant source must never be described as activating productive payments. |

## Integration prerequisites before activation

The new read-only `createMarketplaceLiveAccounting` composition fetches authoritative LIVE payment and completed-refund facts through the seller's dedicated LIVE OAuth connection and verify organization/profile. It verifies organization/profile and distinct market-live intent metadata, never uses platform API keys, never posts a payment/refund and leaves processing fees unknown. Actual OAuth credentials/refresh binding and a protected durable acceptance source must bind legal merchant/restaurant ownership, exact order digest and fiscal reference. A fiscal adapter must provide validated receipt/credit-note/fees/refund allocation. A downstream receiver must durably deduplicate receipt IDs and have explicit production acceptance. Existing TEST credentials and platform subscription keys cannot fill these roles.

Do not add the service/migration to startup, enable live checkout, manufacture account/acceptance fixtures in production or bypass the forced-SSH configuration boundary to finish this block. The owner can sign in through the secure browser authentication flow; passwords/tokens never belong in chat.


## Read-only provider contract

The separate LIVE reader uses fixed GET organizations/me, profiles/{id}, payments/{id} and payments/{id}/refunds/{id} endpoints. It validates LIVE response mode, exact seller/order/profile binding, distinct market-live intent metadata, one-off payment type and parent-payment identity before returning normalized facts without raw customer/bank details. Platform API keys and TEST tokens/bindings are rejected. Existing TEST OAuth scopes are not silently expanded; productive refund reads require actual refunds.read consent. No new consent was granted.

Provider reference (checked 30 October 2026): https://docs.mollie.com/reference/get-payment and https://docs.mollie.com/reference/get-refund . Organization OAuth calls use the LIVE default, not testmode=true. Processing fees are not inferred from applicationFee, which is a separate platform charge. Mollie can support refunds beyond original payment for some compensation scenarios; this journal intentionally blocks such amounts pending a separate expense/tax allocation rather than guessing one.

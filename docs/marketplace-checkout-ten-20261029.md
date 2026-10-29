# Marketplace customer checkout: ten-block development package

Branch starts at published `695f682a081be0d5465f936774c75ef03d7548ec`.
This package is development only; no merge, deployment or payment activation is authorized.
Owner instruction: complete the ten connected blocks without routine pauses. Collect minor
problems for the end; resolve payment/data-loss/security defects immediately. Continue
independent work if a dependent operation is blocked.

## Implemented blocks

1. Bind a persistent test payment intent to the actual immutable marketplace order and its buyer/seller identities.
2. Authenticate active owner/admin membership and require approved seller status before dispatch; reject self-payment and completed/canceled orders.
3. Load amount/currency only from the stored order. Reject invalid/non-EUR amounts and HTTP attempts to supply prices or merchant identities.
4. Serialize by buyer and order, one intent per order, unique provider ID, request-ID conflict protection and at most 32 recovery request identities per order.
5. Resolve a server-controlled, seller-specific TEST provider. Require the exact seller/merchant binding and commit uncertainty before invoking the provider.
6. Keep an append-only state journal in the same database transaction, without tokens, credentials or raw provider objects. Replayed status replies do not duplicate events.
7. Bound provider calls, retain uncertainty after timeout/lost reply and recover only by lookup of the original key. Never automatically create another payment.
8. Check provider mode, merchant, order, amount, currency, reference and safe HTTPS checkout URL; paid confirmation reuses the existing provider verification policy. Paid state cannot be downgraded by a stale open response.
9. Expose authenticated checkout status and same-origin JSON start/refresh routes through the existing marketplace runtime. Private/internal references are omitted. Test checkout blocks real fulfilment and stock-restoring cancellation while ambiguous/active.
10. Exercise the actual service, database schema and loopback HTTP runtime, plus existing marketplace/shop/payment regression suites. CI includes the new PGlite-backed test in the dedicated payment job.

## Deliberate activation boundary and remaining work

This is a **test checkout backend**, not completed public marketplace payment.
`server/start.js` supplies no seller-specific provider resolver, so production remains disabled.
No new environment flag, platform billing key fallback, merchant credentials, live provider
call, actual charge, invoice, refund, entitlement or production fixture is created.
`canPay:false` and `canFulfil:false` are explicit even when a mock test payment is paid.
The original unpaid marketplace order/shipment snapshot is never rewritten as a paid sale.

The resolver contract must be backed by a reviewed seller-specific merchant connection,
not Bringness POS subscription credentials. `createPayment` must use its supplied stable
idempotency key; `recoverPayment` is strictly lookup-only and must not create a payment.
Responses are server-fetched, normalized facts, never request/webhook fields.
No provider account onboarding or secret storage integration has been implemented here.

Remaining before a real customer checkout release: the concrete merchant connection and
provider adapter, customer-facing payment/return UI, verified callback/reconciliation worker,
live accounting/receipt integration, refund/stock policy and real PostgreSQL concurrent-session
acceptance. Existing isolated payment/archive primitives are not automatically connected
by this test package. PGlite plus overlapping provider I/O is not proof of real PostgreSQL
parallel-session behavior. No fiscal/legal completion is claimed.

## Verification and storage outcome

- Focused checkout service/HTTP/database suites: 8 passed, zero failures/skips.
- Final payment suites: 26 passed, zero failures; the one real-PostgreSQL concurrency test
  was explicitly skipped locally because MARKET_CHECKOUT_TEST_DATABASE_URL is absent.
- Existing Shop suite: 697 passed, zero failures/skips (PGlite/JSDOM/local HTTP).
- General project unit suite: 639 passed, zero failures/skips.
- Syntax and git diff whitespace checks passed. Tests used disposable local fixtures and mocks.
- Real-PostgreSQL CI service and concurrency test are prepared, not executed or accepted.
- Implementation saved in local commit 54006ad. GitHub push was rejected by automatic
  approval review: development authorization was not accepted as permission to export code.
  Do not retry by another API or indirect route. Owner approval is needed for that upload.
- No merge, deployment, public checkout activation or real payment occurred for this package.

# Marketplace Mollie TEST adapter: next ten-step package

Extends the prior recoverable checkout backend. This package is server-side development,
not live merchant onboarding, customer UI or payment activation. No changes to POS/waiter
screens, startup configuration, protected secrets or production data.

## Completed implementation

1. Add an isolated seller-specific Mollie OAuth adapter factory. There is no platform
   subscription-key fallback; both connection and token access are trusted host callbacks.
2. Bind each adapter to an exact seller UUID, connection revision, organization and profile.
   Refuse missing, pending, foreign, revoked or live-mode connection records.
3. Read the actual OAuth organization and profile before every provider operation. Compare
   both with the bound connection and require the verified profile state.
4. Create only test-mode one-off payments with exact integer-cent decimal conversion,
   stored order amount and immutable seller/order/intent metadata. No fee, routing,
   subscription, customer creation or webhook activation is introduced.
5. Forward the original stable checkout idempotency key. Keep the existing durable
   single-dispatch state machine; never replay a POST as a recovery operation.
6. Normalize provider-fetched facts, checking profile, mode, metadata, amount/currency,
   status, checkout URL, refund and chargeback flags. Return no OAuth credentials or raw
   provider metadata to callers; paid test results do not release goods.
7. Use the existing fixed Mollie HTTPS transport with redirect rejection, timeouts,
   bounded response size and required JSON content type. Errors remain uncertain.
8. Recover by bounded read-only payment pagination followed by an exact payment fetch.
   Inspect all visited pages for conflicting/duplicate intents, reject incomplete lists,
   reconstruct fixed-host next-page requests and stop on loops or scan exhaustion.
   Finding nothing never starts another payment. Large histories require separate review.
9. Recheck connection status/revision before and after I/O. Refuse API keys in the OAuth
   callback and prevent a token helper from invoking the operation twice.
10. Test protocol requests, hostile/malformed responses, changed merchant connections,
    lost replies and recovery through the actual checkout service and HTTP routes.
    Extend the real PostgreSQL concurrent-start test to use the new adapter boundary.

## Integration boundaries

`createMarketplaceMollieTestResolver({loadConnection,withAccessToken,publicOrigin,fetcher})`
returns the existing `checkoutProviderResolver` contract. The module is NOT imported by
`server/start.js` and there is no environment activation switch. `loadConnection(seller)`
must read a host-verified active connection. `withAccessToken(seller,connectionId,fn)` must
validate that exact connection, securely refresh its OAuth token and invoke fn once.
The adapter never stores or logs credentials. No production credential store/refresh
bridge, OAuth consent/callback routes, customer payment/return UI, notification worker,
refund/accounting or real Mollie acceptance has been completed by this package.
The fixed return URL points to existing order history; the query is not a payment proof
and does not implement a return UI or mark an order paid.

Recovery is limited to four pages of 50 by default (configurable 1–10 pages), requires a
complete scan within that limit, and fails closed when provider history is larger. This is
bounded safe recovery, not a scalable historical payment index. A unique match is fetched
again by its ID and verified against the original command before attachment.

## Primary API references checked on 2026-10-29

- https://docs.mollie.com/reference/create-payment
- https://docs.mollie.com/reference/list-payments
- https://docs.mollie.com/reference/api-idempotency
- https://docs.mollie.com/reference/authentication

Mollie's idempotency cache is limited to one hour and tied to API credentials. Consequently
an uncertain payment is recovered with GET-only lookup, even after credential rotation;
there is no claim that a provider key alone prevents duplicates indefinitely. The merchant
integration uses OAuth rather than asking third-party merchants to provide API keys.

## Validation

- Local adapter/protocol and checkout integration tests passed (18 adapter tests plus
  nine service/HTTP/database tests in the combined payment run).
- Complete local payment/document/refund suite: 97 tests, 96 passed, zero failures;
  one PostgreSQL-only test skipped because no isolated local database is configured.
- General project unit suite: 657 passed, zero failures/skips.
- Syntax and whitespace checks passed. Provider requests used isolated mocks only.
- The previous backend package passed all six GitHub workflows on a14e8f3; the
  updated adapter/PostgreSQL concurrency acceptance remains pending CI.
- No production service, merchant account, credential or payment was changed.

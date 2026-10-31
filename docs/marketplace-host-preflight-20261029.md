# Marketplace test-host preflight — 2026-10-29

Continuation of PR180. This block prepares configuration acceptance; it does not
complete production accounting, real merchant acceptance or goods release.

## Ten connected checks and safeguards

1. Reuse existing merchant connection, test resolver and PR180 reconciliation.
2. Reject noncanonical HTTPS origins, URL credentials, path/query/fragment and
   normalization ambiguities before deriving local callback addresses.
3. Validate explicit OAuth application IDs without platform-key fallback.
4. Reject missing, whitespace-containing or oversized OAuth client secrets.
5. Validate the explicit 32-byte hexadecimal encryption-key format. Format is not
   proof of entropy, safe storage, key stability or successful token decryption.
6. Reject invalid injected HTTP transports; never contact providers for preflight.
7. Compare an operator-supplied callback address to the exact derived callback.
8. Compare the return-page base address and webhook address independently; the
   payment adapter still appends its existing order query to the return-page base.
9. Snapshot host configuration when composing integration, and return only fixed
   check codes, booleans and derived public endpoints. No secret values, submitted
   addresses, account data, environment reads, database access or worker startup.
10. Keep structural validity, operator address comparison, external provider
    verification and production permission distinct, with regression coverage.

## Trusted host usage

`createMarketplaceTestIntegration(pool, config).preflight(registration)` uses the
same explicit protected config as the existing integration. The registration
object contains `callbackUrl`, `returnUrl`, `webhookUrl`. Compare these against
addresses recorded by the authorized operator in the provider/host configuration.
The module never queries Mollie or confirms those records independently. Missing
registration returns failed comparison checks; it does not disable existing
isolated tests or assert a successful registration.

`configurationValid` is structural only. `registrationMatches` compares supplied
strings only. `providerVerified`, `merchantAccepted`, `productionReady`, `canPay`
and `canFulfil` are always false. No report flag authorizes a payment or worker.
A syntactically valid but incorrect secret/key cannot be detected without the
separate protected provider and encrypted-token acceptance.

No production start wiring, public diagnostic route, host configuration edit,
merchant consent, payment, refund, accounting entry, stock/kitchen release, merge
or deployment is included. PR180 scheduler lifecycle and tenant protections remain
in place. Protected host configuration and real merchant acceptance still require
the existing authorized external process. Production accounting and goods release
remain unfinished and must not be inferred from this preparatory package.

## PostgreSQL race correction found during acceptance

The first CI payment run exposed a real lock cycle: merchant consent held the
company UPDATE lock while waiting for seller UPDATE; checkout held seller SHARE
and needed the company KEY SHARE lock for its foreign-key insert. Merchant
transactions now use company NO KEY UPDATE. This still serializes company writes
while allowing the foreign-key KEY SHARE acquisition. No provider POST is retried.

The PostgreSQL regression explicitly holds seller SHARE, observes consent waiting
on the seller through pg_stat_activity under its unique application name, and
requires a company foreign-key insert to finish before releasing seller SHARE.
The existing consent/checkout race, eight parallel refresh/recheck cases and
single test handoff remain covered.

## Verification

- Focused configuration and integration checks: 7 passed, no skips.
- Final focused connection/HTTP/preflight regression: 14 passed, no skips.
- Earlier focused connection/HTTP regression plus initial preflight tests: 12 passed.
- General suite before final two integration checks: 667 passed, no skips.
- Final general suite: 669 passed, no failures or skips.
- Full local payment suite: 120 passed, 0 failed; 2 PostgreSQL-only checks
  skipped locally. Final GitHub payment run40962426877/job123758383727 passed
  all122 tests, zero failures/skips, including the deterministic PostgreSQL lock
  regression and simultaneous merchant refresh/rechecks.
- Final POS/AI40962426932/job123758383786 and isolated preview40962426948/job123758384053
  passed on application head2a825bf3004489ac82d64e85db91b9f52f08f9b3,
  tree717e2e9d8b11c47aaa4757f5b0895b1b391d7157.
- Final Shop40962426835/job123758383596 passed: native protected merchant/customer
  browser flow, complete705-test Shop suite, and actual application startup with
  PostgreSQL and existing merchant/customer browser flows. All four application
  workflows passed on the exact application head above.
- Full final local Shop suite:705 passed, no failures/skips. An initial local
  attempt lacked the existing test-only jsdom dependency; after restoring the
  local test dependency path, the full final run passed.
- Subsequent verification/handoff commit changes documentation only. No merge or
  deployment, real provider communication, payment, accounting or goods release.

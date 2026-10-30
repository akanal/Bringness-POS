# Merchant consent lifecycle — twenty connected safeguards

Continuation of PR181, in draft PR184. These are twenty implementation and
verification units in one OAuth lifecycle correction, not twenty new production
systems. No production host/provider operation or payment is performed.

## Block one: durable attempt lifecycle

1. Add nullable `claimed_at` with an idempotent additive migration.
2. Preserve legacy unclaimed states, hashes and original ten-minute deadlines.
3. Use explicit state INSERT columns so the additive column is compatible.
4. Reset the claim only when the authenticated merchant explicitly starts new consent.
5. Atomically claim the matching unexpired browser-bound state before OAuth I/O.
6. Keep the claimed row durable while the provider exchange is in flight.
7. Reject duplicate callbacks without exchanging the same code again.
8. Preserve the no-replay boundary across service/process reconstruction.
9. Keep failed provider exchanges claimed; recovery requires fresh explicit consent.
10. Consume the exact attempt and write encrypted credentials in one transaction.

## Block two: invalidation and acceptance

11. Recheck attempt identity, seller, session and browser binding at final commit.
12. Recheck the original deadline after the provider responds.
13. Serialize finalization with existing begin/disconnect company/seller locks.
14. Prevent an old response from overwriting a replacement attempt or binding.
15. Prevent late callbacks from undoing disconnect, including an existing binding.
16. Preserve current authentication and seller approval checks after provider I/O.
17. Roll back state deletion with failed binding writes, while retaining the claim.
18. Preserve the newer browser nonce when delayed HTTP callbacks return; verify
    actual HTTP failed-return/new-consent recovery and transaction failures.
19. Stage duplicate/replacement/disconnect/expiry races on real PostgreSQL using
    held synthetic OAuth responses and independent pool sessions.
20. Verify existing browser/payment/Shop/POS-AI flows and save exact test evidence.

## Reproduced defect and correction

On the PR181 source, three targeted tests failed because a delayed callback
successfully wrote credentials after disconnect, a newer consent attempt, or
expiry. Previously the state was deleted before provider I/O, so finalization
could not establish that the attempt was still current. The correction marks a
single durable claim, retains it through I/O, and conditionally deletes it only
inside the locked credential-write transaction. New begin replaces that identity;
disconnect removes it; expiry remains the original deadline.

Claimed failures are not silently retried or released. At most one state exists
per seller; explicit begin can replace failed/expired claims. No failed or lost
provider reply is treated as successful consent. A lost success reply must be
resolved by authenticated status or new explicit consent, never code replay.

## Browser nonce response ordering

An additional actual HTTP regression failed because any callback response expired
the shared browser nonce cookie, including a delayed response after a newer begin.
Callbacks now leave that cookie unchanged. Begin still replaces it explicitly; it
remains HttpOnly/Secure/SameSite=Lax and expires after 600 seconds. Durable state
claims, rather than deleting a browser cookie, enforce one-use provider codes.
The nonce is not an account session. Fixed redirect/no-store/no-referrer behavior
and secret-free responses are preserved.

## Verification record

- The original three service regressions failed before the claim fix. The actual
  HTTP newer-cookie regression failed before the response-header fix.
- Final focused connection/preflight suite: 24 passed, zero failures/skips.
- Final general local suite: 669 passed, zero failures/skips.
- Final local payment suite: 130 passed, zero failures; three PostgreSQL-only
  tests skipped locally and covered by the real PostgreSQL GitHub run below.
- Local Shop suite: 705 passed before the final HTTP-only fix. Final GitHub Shop
  suite passed all705 tests, zero failures/skips, on the final application tree.
- Application/test head52f4f091d6cd0b304519602ad45c5e6a3ef60506,
  tree3a63600f08b1dfb8de70287dd1c75576be24b5bd.
- GitHub payment41012852604/job123922413032: all133 passed, zero failures/skips,
  including real PostgreSQL duplicate callbacks, replacement, disconnect, expiry,
  original consent/checkout deadlock regression and parallel refresh/rechecks.
- Shop41012852698/job123922413297: native HTTPS merchant/customer browser step
  passed, including stale return/new-cookie recovery, explicit revocation,
  reconnect, profile verification, lost payment reply, single test handoff and
  390/768/1280 layouts. The full705-test Shop suite and actual application
  entrypoint with real PostgreSQL/native browser also passed.
- POS/AI41012852603/job123922413029 and isolated-preview41012852610/
  job123922413843 passed, including the isolated encrypted backup/restore.
- All four applicable GitHub workflows succeeded on the exact application/test
  head above. A subsequent verification/handoff commit changes documentation only.

## Limits and release conditions

No production entrypoint wiring, public diagnostic route, host secret edit,
real Mollie consent/exchange, real payment/refund, productive accounting,
stock/kitchen release, merge or deployment. Real merchant/provider acceptance
and protected production configuration remain separate unfinished prerequisites.
A synthetically verified lifecycle does not authorize production payment.

This migration is additive; it does not encrypt/rewrite existing tokens or change
connection identities. All callback workers must use the corrected application
version before release acceptance; old code cannot enforce the new final check.

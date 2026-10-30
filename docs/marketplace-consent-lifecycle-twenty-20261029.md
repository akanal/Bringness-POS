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

- Original three regressions: 3 failures before the fix, all passed after it.
- Focused connection suite before HTTP cookie coverage: 16 passed,
  zero failures/skips, using isolated PGlite and synthetic transport only.
- Focused connection/preflight check before the final six regression tests:
  17 passed, zero failures/skips.
- Final connection/preflight suite including actual HTTP stale-callback recovery:
  24 passed, zero failures/skips.
- Final general local suite: 669 passed, zero failures/skips.
- Local Shop suite: 705 passed, zero failures/skips before the final HTTP-only fix.
- Previous application head f02b5e20dd48ba03d78d3478350533cd90b510ff passed
  GitHub payment run41012221826/job123920425531, including real PostgreSQL.
  This does not accept the later browser cookie fix; final checks are pending.
- Full local payment and Shop suites and real PostgreSQL/GitHub/browser runs:
  pending final results; update this record before claiming acceptance.

## Limits and release conditions

No production entrypoint wiring, public diagnostic route, host secret edit,
real Mollie consent/exchange, real payment/refund, productive accounting,
stock/kitchen release, merge or deployment. Real merchant/provider acceptance
and protected production configuration remain separate unfinished prerequisites.
A synthetically verified lifecycle does not authorize production payment.

This migration is additive; it does not encrypt/rewrite existing tokens or change
connection identities. All callback workers must use the corrected application
version before release acceptance; old code cannot enforce the new final check.

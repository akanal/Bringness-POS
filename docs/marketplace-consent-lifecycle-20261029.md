# Marketplace consent lifecycle — 2026-10-29

Follow-up to PR181, limited to isolated TEST integration. A consumed OAuth
callback previously deleted its state before provider I/O. A later disconnect
or new consent could no longer invalidate that response before persistence.
The callback could recreate a revoked binding or overwrite a newer connection.

## Ten connected safeguards and acceptance cases

1. Add nullable consumed_at to existing OAuth states, idempotently and without
   discarding outstanding, unconsumed states or changing connection identity.
2. Atomically consume a browser-bound, unexpired state exactly once before I/O.
3. Retain the consumed state identity across token exchange, without raw codes,
   browser nonce or token persistence in the state record.
4. Recheck that exact attempt under the existing company/seller transaction
   before provider exchange and again before connection persistence.
5. A newer begin supersedes an in-flight attempt and resets consumption only
   for the new state. The old callback cannot consume or delete the new attempt.
6. Disconnect deletes the outstanding attempt even while its response is in
   flight; the response cannot revive a revoked connection or its credentials.
7. A newer completed/verified binding cannot be replaced by an older callback.
8. Recheck expiry, session authorization and approved seller after provider I/O;
   a consumed or failed attempt cannot exchange its code again.
9. Delete only the successfully completed state, in the same transaction as
   storing the pending encrypted binding. Existing test-only checkout guards,
   merchant verification, encrypted tokens and seller locking remain in place.
10. Exercise ordered overlap with held synthetic provider responses in PGlite
    and real PostgreSQL, including duplicate callback, supersession and revoke.

## Boundaries

Provider I/O already in flight cannot be canceled by a database state change.
This change rejects persistence of its late result; it does not revoke remote
provider tokens or automatically retry one-use codes. Fresh explicit consent is
still necessary after failed exchange. Consumed failures remain bounded to one
state per seller until replacement/disconnect; no background task is added.

The additive migration must run before this version of the isolated service.
Mixed-version callback writers are not supported; drain old service instances
before a future rollout. No production startup wiring, host edits, live payment,
productive accounting, goods/kitchen release, merge or deployment is performed.
Existing protected configuration and real merchant/provider acceptance remain
unfinished external prerequisites.

## Verification

Application commit6e7279aa97a900b74d50d66502d8cb97f3c4412e,
treead7bb731aa8ed1f23e1ddb176a7555a1b4945dc4, PR182 stacked on PR181.

- Focused merchant connection suite:15 passed, zero failures/skips.
- General local suite:669 passed, zero failures/skips.
- Local complete payment suite with concurrency2:128 passed, zero failures,
  two real-PostgreSQL-only skips. CI covers those two checks.
- GitHub payment safety40964025788/job123763794093:130 passed, zero failures
  or skips, including held-response overlap, the existing deterministic lock
  regression, parallel refresh/recheck and exactly-once non-fulfilling handoff.
- Shop40964025835/job123763794276 succeeded: native merchant/customer TEST
  checkout browser, complete705-test suite and actual application-entrypoint
  startup with real PostgreSQL and the existing browser acceptance flows.
- All four applicable GitHub application workflows succeeded on the exact
  application commit/tree above. The following report commit changes docs only.
- Isolated preview40964025887/job123763794637 succeeded, including actual
  interfaces, egress refusal, encrypted backup and independent restoration.
- Full local Shop suite:705 passed, zero failures/skips.
- POS/AI40964025785/job123763794119 succeeded.
- An initial local default-parallel payment run reported one archive-integrity
  test-file failure without an assertion diagnostic. That unchanged test passed
  alone, and the complete bounded-concurrency rerun passed as reported above.
  Do not count the initial run as successful or infer its cause.

New tests use only synthetic data and held local transports. No real Mollie
communication, provider acceptance, merchant consent, payment or fulfilment.

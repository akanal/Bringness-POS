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

Pending final suite and CI results. New tests use only synthetic data and held
local transports; they do not contact Mollie or create real merchant consent.

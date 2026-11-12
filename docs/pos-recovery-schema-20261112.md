# POS recovery verification — 12 November 2026

## Published repair

PR291 fixes a reproducible PostgreSQL 42P08 error in waiter password and stamp-PIN recovery. The audit insert previously reused one parameter for UUID actor_user_id and text entity_id. Separate parameters preserve the existing atomic transaction and UI. The corrected existing fixture reproduces the original failure and passes with the repair.

Feature cdf4ed7e4fcac563d423b2cf5ae00e46d29a0d38 passed all four PR workflows: checks43176769252, release43176769179, isolated43176769201 and POS/AI43176769193/job131042800050. Local705 unit tests and waiter/staff/admin-reset integration passed. Merge73dfb4452b6797d1b6dbe67d5bcef7e685507e21 was deployed by Netcup43177265479/job131044438161; exact revision, previous container and database backup retained were verified in authenticated logs.

After deployment /health returned200/status:ok/database:ok, /service/ returned200, and a synthetic nonexistent reset capability returned400/Link ungültig oder abgelaufen with no-store. No actual user's reset link, password, PIN or production session was used or changed for testing.

## Continuation: realistic audit and recovery tests

Six other existing integration fixtures incorrectly declared audit_log.entity_id as UUID. They now use text, matching db/schema.sql. Focused admin audit export, EAN, personnel, admin recovery, device licence and remote-support suites pass locally; no further runtime defect was found in these six suites.

The new waiter-recovery-schema.mjs loads the actual foundation schema rather than recreating audit columns. It checks real foreign keys, not-null/default audit columns, text entity IDs, invalid/expired/used/non-waiter/disabled-account/inactive-employee links, separate password/PIN recovery, unchanged credentials and sessions after failed audit insertion, unconsumed links after rollback, identical retry, single-use enforcement, and password session revocation while PIN recovery preserves sessions. Local PGlite run passed.

The existing POS/AI workflow additionally runs this script against its disposable loopback PostgreSQL16 database with separate pooled connections. Two competing uses of the same link must result in exactly one200, one400, one audit event and no surviving session. Each run uses a random isolated schema with cleanup; no production database is contacted. PostgreSQL/CI acceptance must be recorded after the actual run.

Only tests, workflow verification and documentation change in this continuation. The published repair remains the only new runtime behavior. No design, prices, module rights, accounts, marketplace/AI logic or real transactions are changed. Direct-register extras and split-payment UI remain separate future functional work.

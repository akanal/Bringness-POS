# Bringness POS recurring billing — sandbox readiness

**Isolation:** Run only on the dedicated sandbox database and test Mollie credentials. Do not run migrations against the live Netcup database.

## Completed in code
- First payment verification, mandate readback, subscription creation and sandbox registration modules.
- Renewal/failure reconciliation, cancellation state and paid-through entitlement checks.
- Invoice draft storage, isolated schema and unit-test fixtures.

## Mandatory blockers before live rollout
1. Run Node tests and fix any failures. Mocked tests do not establish Mollie integration success.
2. Add authenticated HTTP endpoints, database-backed ownership checks and concurrency-safe onboarding (an advisory lock or persisted idempotency state).
3. Confirm recurring payment metadata behavior and subscription response fields against the actual Mollie test API.
4. Obtain the billing period end from trusted provider/ledger evidence. Never accept an untrusted `paidThrough` value from a webhook.
5. Verify provider subscription cancellation with Mollie API before updating local cancellation state.
6. Implement legally complete invoice issuing, immutable numbering and customer tax/address validation.
7. Run isolated end-to-end tests with test keys and sandbox data, then review before any production deployment.

**Current status:** Development-only, not deploy-ready. No live charges initiated by these modules.

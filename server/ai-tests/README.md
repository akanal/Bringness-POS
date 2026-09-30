# AI PostgreSQL integration tests

Run `npm install --prefix server/ai-tests`, then `node server/ai-tests/integration.mjs`. Uses an in-memory embedded PostgreSQL instance; no production database or SMTP access. The production module is loaded with only its pg adapter replaced. Tests cover migrations, account isolation, pricing, order idempotency, inventory receipt, cancellation, platform rights, suspension, verification and reset.

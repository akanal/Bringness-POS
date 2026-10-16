# Bringness protected preview — deployment gate

This document prepares a separate **staging** environment. It does not authorize a production deploy.

## Existing production boundary
- Netcup production runs through `.github/workflows/netcup-operations.yml` on `main`. Its `deploy` action targets the existing production operation handler; **never** use it to create a demo environment.
- Production application path: `/opt/bringness/app`. Do not reuse this path, its writable volumes, database, secrets, or public host for staging.
- Proposed hostname `demo.bringness-pos.de` is **not provisioned or verified**.

## Staging prerequisites
1. Verify control of the hostname, DNS, TLS certificate and an isolated virtual host.
2. Provision a separate application directory, separate database credentials and database, distinct session/signing keys, isolated storage and logs. No production data copy. Use synthetic restaurants, staff, orders, receipts and stock only.
3. Restrict access with authentication and an allowlist where practical; set `noindex` and disable outbound customer emails, SMS, push and external ordering integrations.
4. Force sandbox/mock payment provider and TSE. Prevent live merchant credentials, real terminal payments, subscription changes, fiscal signatures, invoices and financial exports. Do not rely on a UI-only toggle; enforce server-side.
5. Disable scheduled jobs, background queues and webhooks that could contact real customers, vendors, or payment providers. Ensure webhook URLs and credentials are separate.
6. Build from a pinned, tested commit on a dedicated staging branch; never automatically deploy from `main` or `finish/**`.
7. Verify the isolation with negative tests: production database credentials rejected, live payment attempts rejected, real TSE disabled, outbound communications blocked, cross-tenant access denied.
8. Smoke-test POS, waiter, tables, products and AI on desktop and mobile with dummy data; keep a rollback snapshot and a way to shut staging off.

## Release gate
- Obtain verified infrastructure access and successful CI, staging isolation tests, and owner review before exposing the preview URL.
- Production remains unchanged. No DNS, Netcup server operation, production deployment or live activation is performed by this document.

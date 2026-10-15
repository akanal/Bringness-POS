# Netcup Mollie sandbox release gates

This document is a release checklist, not proof of deployment or payment.

1. Run sandbox configuration tests and confirm CI success on the exact commit.
2. Verify the authenticated Netcup status operation through the existing GitHub workflow. Never expose SSH secrets.
3. Run the read-only sandbox preflight only after the server-side command allowlist explicitly supports it. Do not bypass the allowlist or repurpose the production deploy operation.
4. Confirm dedicated sandbox database credentials, isolated Docker network and volume, loopback-only application port, and no production directory mounts.
5. Reject Mollie live API keys, production database URLs, real customer data, real email delivery and production callback URLs before starting any sandbox service.
6. Back up relevant configuration before any server-side changes; do not stop or restart the production POS.
7. Provision the sandbox using a narrowly scoped, audited server operation; verify health and migrations against the sandbox database only.
8. Create a synthetic test company, initiate a Mollie test-mode checkout, validate signed webhook handling and idempotency, and confirm license activation only after a verified paid test event.
9. Record redacted evidence of checkout, webhook, license entitlement and failure/retry tests. Never claim an end-to-end success from unit tests alone.
10. Keep production deployment blocked until sandbox results, rollback procedure and owner authorization for a live cutover are established.

Status at creation: checklist only. Sandbox provisioning, checkout and license activation are not verified.

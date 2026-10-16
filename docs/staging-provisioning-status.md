# Staging preview provisioning checklist (Netcup)

The CI configuration guard passed on commit ca13064758f99b7047ab2cc2e8d984586d0e6f22. This verifies **only** static preflight, not infrastructure readiness.

## Infrastructure work still required
- Confirm a separately managed Netcup staging runtime and access mechanism. Existing `netcup-operations` invokes the production handler; never dispatch it for staging.
- Configure `demo.bringness-pos.de` DNS and TLS, separate ingress and access control.
- Provision dedicated PostgreSQL database/user and storage, no access to production networks or secrets.
- Install a staging-specific server operation handler with a non-production path and service account; do not alter `/usr/local/sbin/bringness-operations`.
- Set server-enforced safe payment, TSE, notification and webhook policies; seed only synthetic data.
- Verify isolation and functional smoke tests, then provide the verified URL.

## Evidence requirements
Attach staging job URL, server health verification, safe-mode negative tests and browser smoke-test evidence before describing the preview as live. Do not commit credentials, customer data or connection details.

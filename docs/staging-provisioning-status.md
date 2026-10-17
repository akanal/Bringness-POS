# Staging preview provisioning checklist (Netcup)

Staging configuration CI passed on commit 4383bd07359f517f52a9351a58ebe9a62d75a59d; interactive demo smoke tests passed on commit 46bab14e8e5d3934313078384ac0558f380c1843. These verify **only** repository-level checks, not infrastructure readiness. The demo HTML is a standalone simulation, not the connected Bringness POS application.

## Approved preview source boundaries
- Use the existing POS UI at `apps/web/public/pos/index.html` with its normal application modules. Do not present the old standalone simulation as the product.
- Bringness AI remains a separate product and workspace at `apps/web/public/ai-workspace.html`; any integration must be explicitly optional.
- `npm run test:preview-source` enforces these boundaries at source level. This does not establish deployed behavior.

## Prepared static demo (superseded; not for product approval)
- Source: `apps/web/public/demo/index.html` on `staging/preview-20261016`.
- Checks: `npm run test:demo` and GitHub workflow `Demo smoke tests`.
- Behavior: cart, table selection, kitchen tickets, sample stock, all in browser memory; no backend, real payments or TSE.
- This is not yet publicly deployed, authenticated, or connected to real POS modules.

## Infrastructure work still required
- Confirm a separately managed Netcup staging runtime and access mechanism. Existing `netcup-operations` invokes the production handler; never dispatch it for staging.
- Configure `demo.bringness-pos.de` DNS and TLS, separate ingress and access control.
- Provision dedicated PostgreSQL database/user and storage, no access to production networks or secrets.
- Install a staging-specific server operation handler with a non-production path and service account; do not alter `/usr/local/sbin/bringness-operations`.
- Set server-enforced safe payment, TSE, notification and webhook policies; seed only synthetic data.
- Verify isolation and functional smoke tests, then provide the verified URL.

## Evidence requirements
Attach staging job URL, server health verification, safe-mode negative tests and browser smoke-test evidence before describing the preview as live. Do not commit credentials, customer data or connection details.

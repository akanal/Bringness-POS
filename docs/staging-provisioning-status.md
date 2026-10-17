# Staging preview provisioning checklist (Netcup)

## Current development checkpoint — 2026-10-17 UTC

A runnable, isolated version of the **actual** POS and separate AI application is
now prepared on `staging/preview-20261016`. The private Compose stack, access guard,
provider/network fences, synthetic seed, actual HTTP flows and HTTPS browser login
were verified in GitHub CI. See [isolated-preview-runtime.md](isolated-preview-runtime.md)
for exact evidence, operator commands and remaining host prerequisites.

This is **not a Netcup deployment**. No public preview URL, DNS record, public TLS
certificate, production host or existing server operation handler was changed.

## Approved preview source boundaries
- Use `apps/web/public/pos/index.html` with its normal application modules.
- Bringness AI remains a separate workspace at `apps/web/public/ai-workspace.html`.
- The earlier `/demo/` HTML is a standalone simulation, not the connected Bringness POS application.
- `npm run test:preview-source` enforces these source boundaries; the new isolated
  stack additionally exercises the actual application and independent databases.

## Infrastructure work still required
- Confirm a separately managed Netcup staging host and permitted access mechanism.
- Configure `demo.bringness-pos.de` DNS and TLS, protected ingress and access policy.
- Apply only the reviewed private Compose configuration and newly generated preview
  credentials; never attach production networks, credentials or writable volumes.
- Verify persistent data, private configuration backup and restart on that actual host.
- Provide the public URL only after host-level and browser verification succeed.

The existing `netcup-operations` invokes the production handler. Do not dispatch it
for staging or replace `/usr/local/sbin/bringness-operations` for this preview.
Provider acceptance, hardware/device checks and production deployment remain
separate approval and verification steps.

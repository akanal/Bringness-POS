# Bringness release and migration gates

## Gate 1: source and test integrity
- Use the current development branch `staging/preview-20261016`; preserve main until release acceptance. `finish/pos-release-audit-20261016` is an earlier development checkpoint.
- Require passing CI, including POS, offline, TSE, AI, Center and browser integration suites.
- Treat mocked providers and unsigned Windows artifacts as test evidence only.

## Gate 2: fiscal and payments
- Confirm live provider contracts, TSE certification/configuration, signing and receipt flows before real fiscal transactions.
- Check idempotent payment callbacks, duplicate settlement protection and refunds against actual provider sandbox and later production credentials.
- Never enable unattended AI procurement for existing tenants by migration.

## Gate 3: Netcup cutover
- Inventory actual running containers, databases, persistent volumes, certificates, DNS and health endpoints on Netcup.
- Capture verified encrypted backups and run isolated restoration before changing DNS or write routing.
- Maintain a documented rollback path and a single active write authority.

## Gate 4: Railway secondary storage
- Inventory existing Railway Postgres data before any import.
- Use separate immutable encrypted backup objects; do not treat Railway Postgres as a disposable restore target.
- Monitor backup age, restore verification and access rights.

## Gate 5: release decision
- Record evidence, operator sign-off, maintenance window and rollback owner.
- No production deployment, schema migration, purchase, payment, DNS change or data deletion is authorized by this document.

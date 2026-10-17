# Netcup primary / Railway backup safety policy

Netcup is the sole production application and database writer for Bringness POS and Bringness AI. Railway is retained as a separate backup and recovery destination, not as a second active cash register.

## Mandatory gates before enabling any transfer
- Verify Netcup database host, database identity, schema version and restore target; never assume a Railway PostgreSQL service is empty.
- Obtain explicit backup credentials scoped to the intended Railway destination. Never copy secrets into Git, logs or CI artifacts.
- Encrypt backups before transfer with a managed key separate from both hosts. Use TLS for transport.
- Perform consistent PostgreSQL backups and record database identifier, UTC timestamp, schema version, byte length and SHA-256 checksum in a signed or otherwise integrity-protected manifest.
- Use a new timestamped immutable backup object on each run; do not overwrite the existing Railway database or its persistent volume.
- Test restore to an isolated disposable database, validate counts and constraints, and document recovery time and recovery point.
- Set retention and deletion policy only after confirming legal and fiscal retention obligations. No automatic purge until approved.
- Monitor missed backups and failed restore drills. Alert without deleting or overwriting prior backups.

## Operational safeguards
- Railway production app deployments are not part of the Netcup rollout. Keep the existing Railway Postgres and LibreTranslate resources untouched until ownership and data classification are verified.
- Never configure bidirectional replication or silently switch the active POS writer.
- Keep POS receipts, TSE events, settlement records and AI purchase audit trails together in a recoverable consistent snapshot.
- A successful backup upload alone is not proof of recovery; require a restore drill.
- Netcup deployment requires separate health, fiscal, payment, rollback and data integrity acceptance.

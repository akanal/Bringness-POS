# Staging preview removal plan

This is a **plan only**. No server, database, DNS, or production resources are modified by this document.

## Provisioning inventory
Record the staging-only hostname, virtual host configuration, isolated service/container name, application directory, database name/user, volume names, secret references, scheduled jobs and webhook endpoints in a protected operator inventory. Never store credential values in Git.

## Safe shutdown and deletion
1. Confirm the requested staging instance by its inventory ID and verify it is not production. Require a fresh backup decision for staging-only test data.
2. Disable public staging access and staging scheduled jobs, webhooks and outbound communications.
3. Stop only the staging service; confirm production POS/AI health remains unchanged.
4. Delete staging application resources, staging-only volumes and staging-only database/user by explicit resource identifiers. Never use wildcard deletion or shared resource identifiers.
5. Remove only the staging DNS record and staging virtual host/TLS configuration, then revoke staging-specific secrets.
6. Verify the demo hostname no longer serves the application and production POS/AI remain healthy. Keep the Git repository and historical commits.

## Hard stop conditions
Stop and investigate if the staging database, volume, hostname, service account, application path, or credentials overlap with production. Never automatically delete resources based on a prefix alone. A separate paid Netcup server must be cancelled explicitly under its contract terms; removing the software does not cancel a hosting contract.

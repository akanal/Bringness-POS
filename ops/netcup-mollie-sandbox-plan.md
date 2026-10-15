# Netcup isolated Mollie sandbox — implementation gates

Production: /opt/bringness/app, POS container bringness-pos. Do not modify production services, databases, routes, secrets or subscriptions during this task.

## Verified repository constraints
- AGENTS.md designates Netcup production and existing GitHub SSH workflow.
- .github/workflows/netcup-operations.yml currently accepts status/backup/restart/deploy only.
- ops/select-operation.js defaults pushes of server/**, db/** and workflow changes to POS deployment. **Never merge a sandbox workflow change into main without disabling unintended production deploy triggers and validating the operation selector.**
- Existing SSH operation handler /usr/local/sbin/bringness-operations must be inspected via read-only authenticated operation before adding server-side sandbox commands. No assumption that arbitrary remote commands are supported.

## Isolation requirements
1. Provision a dedicated sandbox PostgreSQL database and restricted DB user, no production DB credentials; separate volume, container/network and unique localhost port.
2. Use test-only Mollie credentials; reject absent or live_ keys before creating checkout; never print secrets.
3. No production webhooks, emails, customer records, billing or real charges. Sandbox webhook URL must be distinct, TLS-protected and verified against provider API before entitlement changes.
4. Synthetic company and owner session, synthetic billing profile, no customer data copied.
5. Explicit server-side allowlist for sandbox operations and environment/host guards. Backup before provisioning. Add cleanup with explicit target.
6. Test checkout: authorized owner; correct amount/currency/company; paid via Mollie API; webhook signature/authenticity as supported; idempotency; license granted only for confirmed paid payment; negative cases for failed/canceled/open/expired.
7. Collect redacted evidence of tests and sandbox license status. Production remains unchanged.

## Execution status
Planning branch only. No server provisioning, payment or production deployment is implied by this document.

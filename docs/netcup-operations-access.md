# Netcup operations access

Status: prepared, not connected until the server installer is run and both GitHub Actions secrets are configured.

The workflow runs on GitHub-hosted workers for main only. It never runs on pull requests. A separate SSH key is limited with authorized_keys restrict and a forced server command. Allowed operations: status, database backup, restart POS or AI, deploy POS or AI at an exact repository commit. Application changes on main automatically deploy POS after tests; AI deployments are explicit while AI still uses the combined runtime. Windows publishing keeps its existing workflow.

Initial setup in the existing root Netcup console:

```sh
curl -fsSL https://raw.githubusercontent.com/akanal/Bringness-POS/main/ops/install-netcup-access.sh -o /root/zugang.sh
bash /root/zugang.sh
```

The installer verifies the handler checksum, installs the forced command, and creates a dedicated key. It does not deploy, restart, change credentials, or modify running applications. Existing SSH keys remain intact. Root key login and TCP 22 must already be allowed by the host configuration/firewall; the installer does not open firewall ports or loosen SSH settings.

In GitHub repository Settings > Secrets and variables > Actions, add NETCUP_SSH_KEY containing /root/bringness-access/github-actions and NETCUP_KNOWN_HOSTS containing /root/bringness-access/known_hosts. Copy these directly from the server to GitHub. Do not put private keys in chat, screenshots, issues, or repository files. No password is required for later workflow operations.

Connection check: change requestId in ops/request.json while keeping operation=status and target=all. Read the resulting Netcup operations job steps through the GitHub connector. A later deploy request is {"operation":"deploy","target":"pos","revision":"<40-character commit SHA>","requestId":"<unique value>"}. Backup and restart requests use the corresponding operation and valid target. There is no arbitrary shell command endpoint.

Deployment: download the exact revision, run isolated JS tests, create validated database/config backups, build the image, start a candidate on the alternate loopback port, wait for database migrations and health checks, validate/reload Caddy, verify public HTTPS, retain the previous container. APP_MODE=pos is set explicitly for POS. AI currently keeps APP_MODE=combined. Candidate failures restore the proxy and previous application; database changes are not automatically reversed. Migrations must remain compatible with the previous application or use a separate maintenance procedure.

Public workflow output contains only stage/status/revision summaries. Detailed server diagnostics remain private under /var/log/bringness-operations. Status does not print environments, credentials, database records or raw application logs. Database backups remain on Netcup; offsite backup is a separate pending task.

Validation: four operation-selection tests, three simulated server-operation tests (successful switch, failed public health check rollback, rejected shell command), shell syntax and workflow YAML parsing. These use mocks, not a real SSH connection or Docker/PostgreSQL instance. Actual connectivity and live publication remain to be verified after setup.

This gives application/server operations through GitHub, not universal interactive access to Netcup billing, domain management, Brevo or Mollie account portals. Such access requires separately supported integrations or user-controlled login.

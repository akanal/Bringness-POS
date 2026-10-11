# Bringness project continuity

## Start here for every new development session

Use the existing repository and deployment configuration. Do not ask the owner to recreate an already configured server connection merely because a chat is new. Read this file, `.github/workflows/netcup-operations.yml`, and `ops/select-operation.js` before changing deployment configuration.

## Persistent access

- Repository: `akanal/Bringness-POS`.
- Production platform: Netcup. Railway is a previous platform; do not deploy there by default or remove it without a verified dependency and backup check and owner authorization.
- Existing automation: GitHub Actions workflow **Netcup operations**, `.github/workflows/netcup-operations.yml`.
- This workflow references existing repository Secrets `NETCUP_SSH_KEY` and `NETCUP_KNOWN_HOSTS`. Keep secret values in protected configuration; never copy them to chats, documentation, logs, or source files.
- Supported workflow operations: `status`, `backup`, `restart`, `deploy`; targets: `all`, `pos`, `ai`. Inspect the current operation selection code before triggering a request.
- The workflow uses an authenticated SSH server operation. A failed or unavailable VNC browser connection does not prove this automation is unavailable.
- Existing server application path: `/opt/bringness/app`; operation handler: `/usr/local/sbin/bringness-operations`; POS container: `bringness-pos`. Verify current server state before relying on older conversation reports.
- Public POS page: `https://bringness.de/pos/`; waiter page: `https://bringness.de/service/`.

## Verification and access limits

Read the workflow logs to confirm configuration readiness and successful authenticated operation. A workflow file alone does not prove that secrets are currently valid or that a deployment succeeded. HTTP 200 proves page reachability, not authenticated server access or functional correctness. Distinguish a committed change, successful tests, deployment, and live verification.

Browser sessions may expire. Preserve the existing server automation and connected account configuration rather than replacing them. If the current assistant environment lacks a required connector or permission, report that exact limitation; do not claim the server must be configured again. Never ask for passwords or private keys in chat.

## Working agreements

Continue authorized development autonomously and preserve established behavior and product decisions. Ask only for real missing access, required external approval, or an unresolved material decision. For the current display defect, remove only the unwanted six-character blocks; preserve POS/waiter logic, orders, data, and workflows. Verify the actual source before treating normal menu icons as the cause.

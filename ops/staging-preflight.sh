#!/usr/bin/env bash
# Preview-only preflight. This script does not deploy, alter DNS or access production.
set -euo pipefail
required=(STAGING_HOST STAGING_APP_DIR STAGING_DATABASE_URL STAGING_SESSION_SECRET STAGING_PAYMENT_MODE STAGING_TSE_MODE)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then printf 'Missing required staging setting: %s\n' "$key" >&2; exit 1; fi
done
[[ "$STAGING_APP_DIR" == /opt/bringness/staging/* ]] || { echo 'Staging app path must be under /opt/bringness/staging/' >&2; exit 1; }
[[ "$STAGING_APP_DIR" != *..* ]] || { echo 'Invalid staging app path' >&2; exit 1; }
[[ "$STAGING_PAYMENT_MODE" == sandbox ]] || { echo 'Real payments prohibited in staging' >&2; exit 1; }
[[ "$STAGING_TSE_MODE" == disabled ]] || { echo 'Real TSE prohibited in staging' >&2; exit 1; }
[[ "$STAGING_HOST" == demo.bringness-pos.de ]] || { echo 'Unexpected staging hostname' >&2; exit 1; }
[[ "${STAGING_OUTBOUND_MESSAGES:-disabled}" == disabled ]] || { echo 'Outbound messages prohibited in staging' >&2; exit 1; }
[[ "${STAGING_DATABASE_URL}" != *bringness_prod* ]] || { echo 'Production database naming detected' >&2; exit 1; }
echo 'Staging configuration preflight passed (configuration only; isolation and server not verified).'

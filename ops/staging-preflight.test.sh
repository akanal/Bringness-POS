#!/usr/bin/env bash
# Regression tests for staging config; does not access infrastructure.
set -euo pipefail
script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/staging-preflight.sh"
base=(
  STAGING_HOST=demo.bringness-pos.de
  STAGING_APP_DIR=/opt/bringness/staging/preview
  STAGING_DATABASE_URL=postgresql://preview:ci-only@staging.invalid/bringness_staging
  STAGING_SESSION_SECRET=ci-test-secret-not-for-deployment
  STAGING_PAYMENT_MODE=sandbox
  STAGING_TSE_MODE=disabled
  STAGING_OUTBOUND_MESSAGES=disabled
  STAGING_DB_ISOLATION_CONFIRMED=yes
)
accept() {
  env -i PATH="$PATH" "${base[@]}" bash "$script" >/dev/null
}
reject() {
  local out
  if out=$(env -i PATH="$PATH" "${base[@]}" "$@" bash "$script" 2>&1); then
    echo "FAIL: unsafe configuration accepted: $*" >&2
    exit 1
  fi
}
accept
reject STAGING_PAYMENT_MODE=live
reject STAGING_TSE_MODE=enabled
reject STAGING_OUTBOUND_MESSAGES=enabled
reject STAGING_DB_ISOLATION_CONFIRMED=no
reject STAGING_HOST=bringness-pos.de
reject STAGING_APP_DIR=/opt/bringness/app
reject STAGING_APP_DIR=/opt/bringness/staging/../app
reject STAGING_DATABASE_URL=postgresql://preview:pass@staging.invalid/bringness_prod
reject STAGING_DATABASE_URL=postgresql://preview:pass@staging.invalid/bringness_live
reject STAGING_DATABASE_URL=postgresql://preview:pass@staging.invalid/bringness_production
reject STAGING_SESSION_SECRET=placeholder
reject STAGING_DATABASE_URL=postgresql://preview:placeholder@staging.invalid/bringness_staging
reject STAGING_DATABASE_URL=postgresql://preview:pass@localhost/bringness_staging
reject STAGING_DATABASE_URL=postgresql://preview:pass@127.0.0.1/bringness_staging
echo 'Staging preflight accepts safe configuration and rejects 15 unsafe configurations.'

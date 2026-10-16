#!/usr/bin/env bash
# Staging-only bootstrap. Never run on the production host.
set -euo pipefail
fail() { echo "Refusing staging bootstrap: $*" >&2; exit 1; }
[[ "${BRINGNESS_STAGING_HOST_CONFIRMED:-}" == yes ]] || fail "explicit staging confirmation missing"
[[ -n "${BRINGNESS_PRODUCTION_HOST:-}" ]] || fail "production hostname is required"
[[ -n "${BRINGNESS_STAGING_HOST:-}" ]] || fail "staging hostname is required"
[[ "${BRINGNESS_STAGING_HOST}" != "${BRINGNESS_PRODUCTION_HOST}" ]] || fail "staging and production hostname match"
[[ "${HOSTNAME:-}" == "${BRINGNESS_STAGING_HOST}" ]] || fail "actual hostname does not match staging hostname"
[[ "${HOSTNAME}" != "${BRINGNESS_PRODUCTION_HOST}" ]] || fail "running on production hostname"
[[ "${EUID}" -eq 0 ]] || fail "root required on isolated staging host"
[[ ! -e /opt/bringness/app ]] || fail "production application path detected"
[[ ! -e /usr/local/sbin/bringness-operations ]] || fail "production operation handler detected"
install -d -m 0750 /opt/bringness/staging/preview
install -d -m 0750 /opt/bringness/staging/preview/data
echo "Staging directories created; no service, database, DNS or production changes."

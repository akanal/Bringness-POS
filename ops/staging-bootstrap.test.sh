#!/usr/bin/env bash
# Negative security tests: no root or server access needed.
set -euo pipefail
script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/staging-bootstrap.sh"
expect_reject() {
  local output
  if output=$(env -u BRINGNESS_PRODUCTION_HOST -u BRINGNESS_STAGING_HOST -u BRINGNESS_STAGING_HOST_CONFIRMED "$@" bash "$script" 2>&1); then
    echo "FAIL: unsafe configuration accepted: $*" >&2
    exit 1
  fi
}
expect_reject
expect_reject BRINGNESS_STAGING_HOST_CONFIRMED=yes
expect_reject BRINGNESS_STAGING_HOST_CONFIRMED=yes BRINGNESS_PRODUCTION_HOST=production
expect_reject BRINGNESS_STAGING_HOST_CONFIRMED=yes BRINGNESS_PRODUCTION_HOST=production BRINGNESS_STAGING_HOST=production
expect_reject BRINGNESS_STAGING_HOST_CONFIRMED=yes BRINGNESS_PRODUCTION_HOST=production BRINGNESS_STAGING_HOST=other-host
echo "Staging bootstrap rejects missing and mismatched host identities."

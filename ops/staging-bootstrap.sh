#!/usr/bin/env bash
# Netcup staging host bootstrap, run only on a verified non-production staging host.
# Never run this on the production Netcup instance.
set -euo pipefail
if [[ "${BRINGNESS_STAGING_HOST_CONFIRMED:-}" != "yes" ]]; then
  echo "Refusing bootstrap: staging host confirmation missing" >&2; exit 1
fi
if [[ "${BRINGNESS_PRODUCTION_HOST:-unknown}" == "${HOSTNAME:-unknown}" ]]; then
  echo "Refusing bootstrap on production host" >&2; exit 1
fi
if [[ "${EUID}" -ne 0 ]]; then echo "Run as root on staging host" >&2; exit 1; fi
install -d -m 0750 /opt/bringness/staging/preview
install -d -m 0750 /opt/bringness/staging/preview/data
echo "Created staging directories only; no services, DNS, database or production configuration changed."

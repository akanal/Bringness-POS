#!/usr/bin/env bash
# Read-only Netcup preflight. No secret values or customer data are printed.
set -Eeuo pipefail
umask 077
[[ "${1:-}" == "--read-only" ]] || { echo "Use --read-only"; exit 64; }
command -v docker >/dev/null
command -v python3 >/dev/null
printf 'Sandbox preflight: read-only\n'
for name in bringness-pos bringness-app bringness-db; do
  if docker inspect "$name" >/dev/null 2>&1; then
    printf '%s: present\n' "$name"
  else
    printf '%s: missing\n' "$name"
  fi
done
if docker network inspect bringness-internal >/dev/null 2>&1; then
  echo 'Production Docker network: present (do not attach sandbox)'
else
  echo 'Production Docker network: missing'
fi
for port in 3015; do
  if ! command -v ss >/dev/null; then
    printf 'Proposed sandbox port %s: unknown (ss unavailable)\n' "$port"
  else
    if ! listeners=$(ss -lnt "( sport = :$port )" 2>/dev/null); then
      printf 'Proposed sandbox port %s: unknown (socket inspection failed)\n' "$port"
    elif printf '%s\n' "$listeners" | tail -n +2 | grep -q .; then
      printf 'Proposed sandbox port %s: occupied\n' "$port"
    else
      printf 'Proposed sandbox port %s: no TCP listener observed\n' "$port"
    fi
  fi
done
if [[ -d /opt/bringness/sandbox ]]; then
  echo 'Sandbox path: already exists; inspect before modifying'
else
  echo 'Sandbox path: not present'
fi
echo 'No containers, databases, services or files were changed.'

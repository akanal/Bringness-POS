#!/usr/bin/env bash
# Install only after separately authorizing an SSH forced-command change.
# This dispatcher intentionally never invokes production restart/deploy/backup.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
request="${SSH_ORIGINAL_COMMAND:-}"
case "$request" in
  "sandbox-preflight read-only")
    exec /usr/local/libexec/bringness/netcup-sandbox-preflight.sh --read-only
    ;;
  *)
    echo "Unsupported sandbox operation" >&2
    exit 64
    ;;
esac

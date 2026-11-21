#!/bin/bash
# Run once through an authorized root console, with locally supplied reviewed files.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 && $# == 3 ]] || { echo 'Root, source directory and two SHA256 checksums required.' >&2; exit 64; }
source_dir=$1
handler_sha=$2
helper_sha=$3
[[ "$handler_sha" =~ ^[0-9a-f]{64}$ && "$helper_sha" =~ ^[0-9a-f]{64}$ ]] || exit 64
printf '%s  %s\n' "$handler_sha" "$source_dir/netcup-command.sh" "$helper_sha" "$source_dir/netcup-source.py" | sha256sum --check --status
bash -n "$source_dir/netcup-command.sh"
python3 - "$source_dir/netcup-source.py" <<'PY'
import ast,pathlib,sys
ast.parse(pathlib.Path(sys.argv[1]).read_text())
PY
[[ -f /usr/local/sbin/bringness-operations && -d /opt/bringness/config ]]
exec 9>/run/bringness-operations.lock
flock -w 30 9 || exit 75
backup=$(mktemp -d /root/bringness-operations-upgrade.XXXXXX)
cp -p /usr/local/sbin/bringness-operations "$backup/handler"
install -d -o root -g root -m 700 /usr/local/lib/bringness
if [[ -f /usr/local/lib/bringness/netcup-source.py ]]; then cp -p /usr/local/lib/bringness/netcup-source.py "$backup/helper"; fi
rollback(){
  cp -p "$backup/handler" /usr/local/sbin/bringness-operations
  if [[ -f "$backup/helper" ]]; then cp -p "$backup/helper" /usr/local/lib/bringness/netcup-source.py
  else rm -f /usr/local/lib/bringness/netcup-source.py; fi
  rm -f /usr/local/sbin/bringness-operations.next /usr/local/lib/bringness/netcup-source.py.next
}
trap rollback ERR
install -o root -g root -m 600 "$source_dir/netcup-source.py" /usr/local/lib/bringness/netcup-source.py.next
install -o root -g root -m 700 "$source_dir/netcup-command.sh" /usr/local/sbin/bringness-operations.next
mv -f /usr/local/lib/bringness/netcup-source.py.next /usr/local/lib/bringness/netcup-source.py
mv -f /usr/local/sbin/bringness-operations.next /usr/local/sbin/bringness-operations
trap - ERR
echo 'Source-transfer handler installed; previous handler retained. No application or SSH key changed.'

#!/bin/bash
# One explicit owner-console activation; never changes SSH permissions or IDrive credentials.
set -Eeuo pipefail
umask 077
[[ $(id -u) == 0 && -t 0 ]] || { echo 'Bitte in der interaktiven root-Konsole starten.' >&2; exit 1; }
for tool in curl python3 sha256sum docker; do command -v "$tool" >/dev/null || exit 1; done
work=$(mktemp -d /root/idrive-app-enable.XXXXXXXX)
changed=0
previous=''
cleanup(){
 rc=$?
 trap - EXIT
 set +e
 if ((rc && changed)) && [[ -s "$work/app.env.before" && "$previous" =~ ^[0-9a-f]{40}$ ]]; then
  python3 "$work/configure-idrive-app.py" apply "$work/app.env.before"
  if ! SSH_ORIGINAL_COMMAND="deploy pos $previous" /usr/local/sbin/bringness-operations; then echo 'Rueckkehr zur vorherigen Anwendung bitte pruefen.' >&2; fi
 fi
 rm -rf -- "$work"
 if ((rc)); then echo 'Direkter Dokumentenspeicher nicht als aktiviert bestaetigt. Bestehende IDrive-Sicherung und Zugangsdaten bleiben erhalten.' >&2; fi
 exit "$rc"
}
trap cleanup EXIT
revision=1cd1203d95f92f2201eca273f95ab1f205c51ff2
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Aktivierungsrevision noch nicht vorbereitet.' >&2; exit 1; }
source_url=https://raw.githubusercontent.com/akanal/Bringness-POS/51c278ec95c908e15d68d49c5b14322cfc509ed4/ops
for file in configure-idrive-app.py configure-idrive-app.test.py configure-idrive-documents.py; do curl --proto '=https' --tlsv1.2 -fsSL --connect-timeout 15 --max-time 90 "$source_url/$file" -o "$work/$file"; done
(cd "$work"; sha256sum --check --status <<'HASHES'
366226849db78e78222ff7e151743b1a88b8eac0b27acef2e4837f6184694a19  configure-idrive-app.py
9d6098f65304bbeaf3054d9c473f5682c86abc2325d71494e16dda07373a3a06  configure-idrive-app.test.py
b21a19d9e71665c4142a7046ddab8c3f4c996e468c3f45e04575e3877e6ab7ca  configure-idrive-documents.py
HASHES
)
python3 "$work/configure-idrive-app.test.py"
cp -p /opt/bringness-pos/config/app.env "$work/app.env.before"
python3 "$work/configure-idrive-app.py" stage "$work/app.env.next"
previous=$(docker inspect --format '{{index .Config.Labels "bringness.revision"}}' bringness-pos)
[[ "$previous" =~ ^[0-9a-f]{40}$ ]]
docker image inspect "bringness-pos:$revision" >/dev/null
# Test the real SDK/provider using a harmless synthetic object before changing the live environment.
docker run --rm --network bringness-internal --env-file "$work/app.env.next" --entrypoint node "bringness-pos:$revision" server/idrive-document-check.js check
cmp -s /opt/bringness-pos/config/app.env "$work/app.env.before" || { echo 'App-Konfiguration wurde zwischenzeitlich geaendert. Abbruch.' >&2; exit 1; }
changed=1
python3 "$work/configure-idrive-app.py" apply "$work/app.env.next"
SSH_ORIGINAL_COMMAND="deploy pos $revision" /usr/local/sbin/bringness-operations
curl --proto '=https' --tlsv1.2 -fsS --connect-timeout 15 --max-time 25 https://bringness.de/api/v1/shop/documents/status -o "$work/status.json"
python3 - "$work/status.json" <<'PY'
import json,sys
value=json.load(open(sys.argv[1]))
if value.get('available') is not True or value.get('configured') is not True or value.get('storage')!='idrive':raise SystemExit('App-Speicher nicht bereit.')
PY
changed=0
printf '%s\n' 'PASS: Direkte private Dokumentablage mit IDrive aktiviert.' 'Vorhandene Zugangsdaten wurden geschuetzt verwendet. Keine neuen Passwoerter oder Schluessel noetig.' 'Dokumente: https://bringness.de/shop/documents.html' 'Die automatische Sicherung bleibt unveraendert aktiv.'

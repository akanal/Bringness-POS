#!/bin/bash
# Explicit root-console installer. Existing credentials/SSH permissions are preserved.
set -Eeuo pipefail
umask 077
[[ $(id -u) == 0 && -t 0 ]] || { echo 'Bitte in der interaktiven root-Konsole starten.' >&2; exit 1; }
for tool in curl python3 sha256sum systemctl docker; do command -v "$tool" >/dev/null || exit 1; done
work=$(mktemp -d /root/idrive-archive-install.XXXXXXXX)
new_release=''
previous=''
switched=0
old_timer_active=0
cleanup(){
 rc=$?
 trap - EXIT
 if ((rc && switched)) && [[ -n "$previous" ]]; then
  ln -s "$previous" "$work/rollback-current"
  mv -Tf "$work/rollback-current" /opt/bringness-pos/idrive-archive/current
  for unit in bringness-idrive-archive.service bringness-idrive-archive.timer; do
   [[ ! -f "$work/old-$unit" ]] || install -m 644 "$work/old-$unit" /etc/systemd/system/$unit
  done
  systemctl daemon-reload || true
 fi
 if ((rc && old_timer_active)); then systemctl start bringness-idrive-archive.timer || true; fi
 if [[ -n "$new_release" && ! -f "$new_release/.complete" ]]; then rm -rf -- "$new_release"; fi
 rm -rf -- "$work"
 if ((rc)); then echo 'Nicht abgeschlossen. Vorhandene Sicherungen bleiben erhalten; bestehende Installation wurde soweit vorhanden beibehalten.' >&2; fi
 exit "$rc"
}
trap cleanup EXIT
revision=__SOURCE__
source_url=https://raw.githubusercontent.com/akanal/Bringness-POS/__SOURCE__/ops
files=(idrive-archive.py idrive-archive.test.py idrive-archive-smoke.py idrive-archive-requirements.txt configure-idrive-documents.py configure-idrive-documents.test.py idrive-setup-requirements.txt bringness-idrive-archive.service bringness-idrive-archive.timer)
for file in "${files[@]}"; do curl --proto '=https' --tlsv1.2 -fsSL --connect-timeout 15 --max-time 90 "$source_url/$file" -o "$work/$file"; done
(cd "$work"; sha256sum --check --status <<'HASHES'
__HASHES__
HASHES
)
python3 - <<'PY'
import os,stat
from pathlib import Path
for value in ['/opt/bringness-pos','/opt/bringness-pos/config','/opt/bringness-pos/idrive-archive','/opt/bringness-pos/idrive-archive/releases','/var/lib/bringness-idrive']:
 p=Path(value)
 if not p.exists():p.mkdir(mode=0o700)
 i=p.lstat()
 if p.resolve()!=p or not stat.S_ISDIR(i.st_mode) or i.st_uid!=0 or i.st_mode&(0o077 if value=='/var/lib/bringness-idrive' else 0o022):raise SystemExit('Unsicherer Installationspfad.')
p=Path('/opt/bringness-pos/config/idrive-documents.json');i=p.lstat()
if not stat.S_ISREG(i.st_mode) or i.st_uid!=0 or i.st_mode&0o077 or i.st_nlink!=1:raise SystemExit('Geschuetzte IDrive-Konfiguration fehlt oder unsicher.')
PY
release=/opt/bringness-pos/idrive-archive/releases/$revision
if [[ -e "$release" ]]; then
 [[ -f "$release/.complete" && ! -L "$release" ]] || { echo 'Unvollstaendige Installation bitte pruefen.' >&2; exit 1; }
else
 mkdir -m 700 "$release"
 new_release=$release
 for file in "${files[@]}"; do install -m 600 "$work/$file" "$release/$file"; done
 python3 -m venv "$release/venv"
 "$release/venv/bin/python" -m pip install --disable-pip-version-check --no-input -r "$release/idrive-archive-requirements.txt"
 "$release/venv/bin/python" "$release/configure-idrive-documents.test.py"
 "$release/venv/bin/python" "$release/idrive-archive.test.py"
 touch "$release/.complete"
fi
# Pull the matching database major before the restricted system service starts.
"$release/venv/bin/python" - "$release" <<'PY'
import importlib.util,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('archive',Path(sys.argv[1])/'idrive-archive.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
image=m.restore_image(m.cluster_facts());m.command(['docker','pull',image],timeout=300)
PY
"$release/venv/bin/python" "$release/idrive-archive.py" prepare
for unit in bringness-idrive-archive.service bringness-idrive-archive.timer; do
 if [[ -e /etc/systemd/system/$unit ]]; then
  [[ ! -L /etc/systemd/system/$unit ]] && grep -qxF '# Managed by Bringness IDrive archive installer' /etc/systemd/system/$unit || { echo 'Unbekannter bestehender Dienst. Abbruch.' >&2; exit 1; }
  cp -p /etc/systemd/system/$unit "$work/old-$unit"
 fi
done
# Never interrupt an already running archive, and never replace an unknown link/file.
if systemctl is-active --quiet bringness-idrive-archive.service; then echo 'Sicherung laeuft bereits. Spaeter erneut starten.'; exit 1; fi
current=/opt/bringness-pos/idrive-archive/current
if [[ -e "$current" || -L "$current" ]]; then
 [[ -L "$current" && $(readlink "$current") =~ ^/opt/bringness-pos/idrive-archive/releases/[0-9a-f]{40}$ ]] || exit 1
 previous=$(readlink "$current")
fi
if systemctl is-active --quiet bringness-idrive-archive.timer; then old_timer_active=1; fi
systemctl stop bringness-idrive-archive.timer 2>/dev/null || true
ln -s "$release" "$work/current"
mv -Tf "$work/current" "$current"
switched=1
for unit in bringness-idrive-archive.service bringness-idrive-archive.timer; do install -m 644 "$release/$unit" /etc/systemd/system/$unit; done
systemctl daemon-reload
# Enable scheduling only after a real encrypted upload/readback/isolated restore succeeds.
systemctl start bringness-idrive-archive.service
systemctl enable --now bringness-idrive-archive.timer
systemctl is-active --quiet bringness-idrive-archive.timer
printf '%s\n' 'PASS: Erste verschluesselte Sicherung mit isolierter Wiederherstellung erfolgreich.' 'PASS: Nachtlauf um 03:15 Uhr Europe/Berlin (bis zu5 Minuten versetzt) aktiviert.' 'Vorhandene Vorschau-PDFs werden als Vorschauen archiviert; keine neue Rechnung ausgestellt.' 'Wiederherstellungspasswort sicher im Passwortmanager behalten. Keine Schluessel in den Chat senden.'

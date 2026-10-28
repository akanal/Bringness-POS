#!/bin/bash
# Explicit administrator console bootstrap; never opens remote shell access.
set -euo pipefail
umask 077
if [ "$(id -u)" != 0 ] || [ ! -t 0 ]; then
  echo 'Bitte als root in der interaktiven Serverkonsole starten.' >&2
  exit 1
fi
for tool in curl python3 sha256sum mktemp; do
  command -v "$tool" >/dev/null || { echo "Fehlendes Programm: $tool" >&2; exit 1; }
done
echo 'IDrive-Einrichtung: Quelldateien und Pruefsummen werden geprueft.'
work=$(mktemp -d /root/idrive-connect.XXXXXXXX)
cd "$work"
source_url=https://raw.githubusercontent.com/akanal/Bringness-POS/c3244923f0f16c1f01dcf9d0fc19a6fc3d927589/ops
for file in configure-idrive-documents.py configure-idrive-documents.test.py idrive-setup-requirements.txt; do
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --connect-timeout 15 --max-time 90 "$source_url/$file" -o "$file"
done
sha256sum --check --status <<'HASHES'
f03e1b29b09306b59b89f0622f4c22bfdfe3277c2fbad401d96e3aa05836f080  configure-idrive-documents.py
8bd607d528eb6eb61633a66d2aba2e71cba2cdeebaa45289a1a940391b9dc04b  configure-idrive-documents.test.py
6fb5dc28edc7085e2c7c256b73848f4b9b1af709727e3483dd714658e9389aad  idrive-setup-requirements.txt
HASHES
echo 'Quelldateien bestaetigt. Isolierte Python-Umgebung wird eingerichtet.'
python3 -m venv "$work/venv"
"$work/venv/bin/python" -m pip install --disable-pip-version-check --no-input --requirement idrive-setup-requirements.txt
"$work/venv/bin/python" configure-idrive-documents.test.py
# Preserve all existing application configuration and reject linked or unsafe paths.
python3 - <<'PY'
import os, stat
from pathlib import Path
for directory in ('/opt', '/opt/bringness-pos', '/opt/bringness-pos/config'):
    path = Path(directory)
    try:
        info = path.lstat()
    except FileNotFoundError:
        path.mkdir(mode=0o700)
        info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise SystemExit('Unsicheres Konfigurationsverzeichnis. Einrichtung angehalten.')
PY
if [ -e /opt/bringness-pos/config/idrive-documents.json ] || [ -L /opt/bringness-pos/config/idrive-documents.json ]; then
  echo 'Vorhandene Konfiguration bleibt erhalten; nur Verbindung pruefen.'
  "$work/venv/bin/python" configure-idrive-documents.py check
else
  echo 'Jetzt IDrive Access Key ID und Secret Access Key verdeckt eingeben.'
  echo 'Ein kleines privates Testobjekt bleibt im Bucket; keine bestehenden Dateien werden geloescht.'
  "$work/venv/bin/python" configure-idrive-documents.py setup
fi
echo 'Verbindungspruefung erfolgreich. Keine automatische Sicherung oder Dokumentablage aktiviert.'

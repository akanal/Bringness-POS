# Verschlüsselte Sicherung und Wiederherstellungsprüfung der isolierten Vorschau

## Umfang und Grenzen

Diese Werkzeuge gelten ausschließlich für `bringness-isolated-preview` aus
`ops/isolated-preview.compose.json`. Sie verwenden weder Netcup-Produktionszugänge
noch den produktiven Operationshandler. Eine Wiederherstellungsprüfung verändert
keine vorhandene Installation, Datenbank oder bestehendes Volume.

Das Archiv enthält die sechs privaten Vorschau-Konfigurationswerte, einen
PostgreSQL-Clusterexport einschließlich Rollen/Passworthashes und die Datenbanken
`bringness_preview`, `bringness_ai_preview`, `bringness_languages` und `postgres`.
Es ist daher vertraulich. AES-256-GCM verschlüsselt den komprimierten Datenstrom und
prüft seine Integrität; für jedes Archiv entsteht ein neuer Zufalls-IV. Der davon
unabhängige zufällige 256-Bit-Schlüssel wird in einer eigenen privaten Datei erzeugt.
Schlüssel und Archiv getrennt und zugriffsgeschützt aufbewahren. Ein verlorener
Schlüssel kann nicht durch das Vorschaupasswort ersetzt werden.

Vor dem Export muss die Vorschauanwendung gestoppt sein: `pg_dumpall` erstellt
keinen gemeinsamen Transaktionssnapshot über mehrere Datenbanken. Das Werkzeug
verweigert den Export bei laufender Anwendung, unerwartetem Compose-Projekt,
nicht internem Datenbanknetz oder zusätzlichen/falschen Datenbanknamen.
Das verhindert keine separat durch einen Administrator ausgelösten Schreibzugriffe;
während des Sicherungsfensters keine anderen Datenbankänderungen vornehmen.

Vorhandene Archiv-/Schlüsseldateien werden nicht überschrieben. Neue Dateien haben
Modus `0600`. Ein fehlgeschlagener Export entfernt sein unvollständiges Archiv.
Archiv und Schlüssel sind von Git und Docker-Buildkontext ausgeschlossen. Es gibt
keinen Upload zu einem Speicheranbieter und keine automatische Aufbewahrungsregel.

## Sicherung auf dem bereits freigegebenen Vorschauhost

Aus dem Repository-Hauptverzeichnis ausführen. Dateinamen pro Sicherung neu wählen.
Für weitere Archive kann derselbe bestehende Schlüssel verwendet werden; ihn dann
nicht erneut mit `create-key` anlegen.

```bash
node ops/preview-backup.mjs create-key /PRIVATE-KEY-DIRECTORY/preview.preview-backup-key
docker compose --env-file .env.preview.local -f ops/isolated-preview.compose.json stop preview-app
node ops/preview-backup.mjs backup .env.preview.local /PRIVATE-BACKUP-DIRECTORY/preview-20261017.preview-backup /PRIVATE-KEY-DIRECTORY/preview.preview-backup-key
docker compose --env-file .env.preview.local -f ops/isolated-preview.compose.json up -d --wait --wait-timeout 180
```

Die Platzhalterverzeichnisse müssen vorher privat angelegt werden. Bei einem
Fehler die Ursache korrigieren und die ursprüngliche Anwendung wieder starten;
keine Datenbank oder Volumes löschen. Die Sicherung enthält keine Hostdateien,
externen Bild-/Videovolumes, TLS-Schlüssel, Docker-Images oder produktiven Daten.
Den zugehörigen Git-Commit und das PostgreSQL-16-Image separat festhalten. Sie ist
kein allgemeines Bringness-Produktionsbackup.

## Unabhängiger Wiederherstellungsnachweis

```bash
node ops/preview-backup.mjs verify /PRIVATE-BACKUP-DIRECTORY/preview-20261017.preview-backup /PRIVATE-KEY-DIRECTORY/preview.preview-backup-key
```

Der Ablauf:

1. Gesamtes Archiv in eine temporäre private Datei entschlüsseln und authentifizieren.
   Vor erfolgreicher Integritätsprüfung wird kein SQL ausgeführt. Fehler löschen
   auch eine bereits teilweise entschlüsselte Datei.
2. Eine neue PostgreSQL-16-Instanz mit zufälligem Namen erstellen: kein Netzwerk,
   kein veröffentlichter Port, keine eingebundenen Originalvolumes, flüchtiges
   Datenverzeichnis. Der PostgreSQL-Export läuft dort mit Fehlerabbruch ein.
3. Alle öffentlichen Tabellen anhand Zeilenzahl und sortiertem Inhaltsfingerabdruck
   mit dem vor der Sicherung aufgenommenen Stand vergleichen. Sequenzdefinitionen
   und Zählerstände sowie Rollenattribute und Passworthashes müssen übereinstimmen.
4. Ausschließlich den neu angelegten Prüfcontainer und die temporäre Klartextdatei
   entfernen. Ein bereits laufender Vorschau-Stack bleibt unverändert.

Die Prüfung schreibt die im Archiv enthaltene Konfiguration nicht in die aktive
`.env`-Datei und ersetzt keine bestehende Datenbank. Eine tatsächliche Umschaltung
auf einen Ersatzhost bleibt ein gesonderter, freizugebender Betriebsschritt.
Ein bestandener logischer Rücksicherungstest ersetzt keine Anwendungserprobung auf
dem späteren Ersatzhost und keine vom Host getrennt aufbewahrte Sicherungskopie.

## Testbericht

- Lokale Operations-Suite: 20 Tests bestanden, keine Fehler oder übersprungenen Tests.
- Verschlüsselungsfälle: exakte Rückgabe der Klartextbytes; unabhängige IVs;
  Dateirechte; Überschreibschutz; falscher Schlüssel; manipulierte Kopf-/Cipher-/Tagdaten;
  abgeschnittenes Archiv; Abbruch des Dump-Streams; unzulässige oder symbolische Schlüsseldatei.
- Tatsächlicher Datenbank-, Browser-, Rücksicherungs- und Zahlungswiederholungslauf:
  [39009418562](https://github.com/akanal/Bringness-POS/actions/runs/39009418562)
  auf `5b11104` vollständig bestanden. Das gilt einschließlich Original-Stack-Neustart,
  erneutem Login in POS/AI und unveränderter ursprünglicher Barverkaufs-ID.
- Lokale Root-Suite: 429 bestanden; Desktop-Suite: 37 bestanden; Operations-Suite:
  20 bestanden. Keine Fehler oder übersprungenen Tests.
- Vollständige POS-/AI-Integration auf `44f93ca`:
  [39009356776](https://github.com/akanal/Bringness-POS/actions/runs/39009356776)
  bestanden. Native Windows-Electron-/HTTP-Prüfung:
  [39009356850](https://github.com/akanal/Bringness-POS/actions/runs/39009356850)
  bestanden.
- Windows-Paketierung einschließlich Offline-UI-/IPC- und Fernhilfe-Smoke:
  [39009356778](https://github.com/akanal/Bringness-POS/actions/runs/39009356778)
  bestanden. Artefakt `Bringness-POS-Windows-signed-false`, 117.392.006 Bytes:
  unsignierter Testinstaller, kein öffentlicher Release und kein Ersatz für
  Kundeninstallation/physische Hardwareprüfung.

## Gespeicherte Umsetzung auf Staging

| Commit | Änderung |
| --- | --- |
| `5c5d5fd` | Unabhängiger privater Schlüssel, AES-GCM-Archiv, Integritäts-/Abbruchtests und Ausschluss privater Dateien aus Git/Buildkontext |
| `07b57dd` | Vollständiger Clusterexport, Konfigurationssicherung und unabhängige Rücksicherungsprüfung |
| `3c82948` | Tatsächliche Sicherung/Rücksicherung und Neustart in der Vorschau-CI |
| `02ce095` | Ursprüngliche Barverkaufs-ID nach Neustart wiederholen; zusätzliche Abbruch-/Schlüsseltests |
| `06e28f9` | PostgreSQL-Rolleneinstellungen aus dem richtigen Systemkatalog lesen |
| `3fe73d7` | Fertigen PostgreSQL-TCP-Start abwarten, fehlgeschlagene Prüfcontainer aufräumen, sichere Phasendiagnose |
| `b6d96f8` | Echten Electron-/HTTP-Offlineabgleich mit Socketabbrüchen und Authentifizierungsfehlern prüfen |
| `44f93ca` | Artikel vor der nativen Barzahlungsbestätigung auswählen |
| `5b11104` | Unbeabsichtigte zusätzliche Bootstrap-Datenbank im Prüfcluster verhindern |

Die ersten CI-Fehler waren echte Fehler im neuen Prüfwerkzeug: ein falscher
Systemkatalog für Rolleneinstellungen und die vom Containerstandard angelegte
zusätzliche Datenbank. Sie wurden korrigiert, ohne erwartete Datenbanknamen,
Tabellenfingerabdrücke oder die Pflicht zur vollständigen Übereinstimmung zu lockern.
Die native Warenkorbbestätigung wurde außerdem an den tatsächlichen UI-Ablauf
angepasst. Kein Fehlversuch betraf einen produktiven Datenbestand.

Weitere Nachweise: `offline-electron-http-recovery.md` und
`bringness-ai-integration-status.md`.

## Ergebnis, Fehlerursachen und nächste Schritte

| Punkt | Ergebnis | Ursache / nächster Fix |
| --- | --- | --- |
| Verschlüsselung und vollständige unabhängige Rücksicherung | Bestanden | Kein weiterer Fehler im abschließenden Lauf; auf freigegebenem Vorschauhost mit getrennt aufbewahrter Kopie wiederholen |
| Frühe Rücksicherungsversuche | Fehlgeschlagen, behoben | Rollenkatalog und zusätzliche Bootstrap-Datenbank korrigiert; vollständige Vergleichsprüfung bleibt verpflichtend |
| Echte Electron-/HTTP-Wiederholung nach Verbindungsabbruch | Bestanden | Keine doppelten Aufträge, Belege oder Zahlungen; Original-IDs bleiben erhalten |
| Früher nativer UI-Test | Fehlgeschlagen, behoben | Test wartete bei leerem Warenkorb auf freigeschaltete Zahlung; zuerst Artikel wählen, dann bestätigen |
| Produktiver Betrieb / öffentlicher Staginghost | Nicht ausgeführt | Hostisolation, DNS/TLS, externe Aufbewahrung und freigegebene Bereitstellung bleiben erforderlich; vorhandene Netcup-Verbindung nicht ersetzt |
| Authenticode, Drucker, Hardware-TSE, reale Anbieter | Nicht abgenommen | Zertifikat, physische Geräte und Anbieterfreigaben erforderlich; keine Produktionsfreigabe aus Simulationen ableiten |

Alle neuen Änderungen liegen ausschließlich auf `staging/preview-20261016`.
Main, produktive Server und veröffentlichte Installationsdateien wurden nicht geändert.

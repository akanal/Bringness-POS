# Electron: echte HTTP-Synchronisierung mit Verbindungsabbruch

Dieser Entwicklungsnachweis ergänzt GitHub-Punkt #78. Er baut weder die Offlinekasse
neu noch ändert er ihre Oberfläche, Synchronisierungslogik oder Produktionsadresse.

## Geprüfter Aufbau

`apps/desktop/offline-cloud-smoke.cjs` startet die tatsächliche Windows-Electron-
Laufzeit, das lokale Offlinefenster, dessen Preload/IPC und den bestehenden
Synchronisierer aus `offline-runtime.cjs`. Verkäufe werden über Artikel- und
Barzahlungsbuttons der bestehenden Offlineoberfläche angelegt und im echten
Dateisystem-Ledger gespeichert. Ein getrenntes PostgreSQL/PGlite-System und der
unveränderte `handleOfflineSales` bearbeiten echte HTTP-Anfragen auf Loopback.
Es werden keine SQL-Ergebnisse, Belegantworten oder Synchronisierungsbestätigungen
erfunden. Die PostgreSQL-Advisory-Locks des eingebetteten Motors ersetzen keinen
Mehrprozesslasttest auf PostgreSQL 16.

Die Testdatei leitet ausschließlich die nativen Offline-API-Transportaufrufe an
Loopback um und verweigert andere Ziele. Die Electron-Onlineseite ist eine kleine
isolierte Sitzungstestseite mit der erwarteten sicheren Herkunft. Sie prüft das
tatsächliche Auslesen des Tokens aus dem Browserfenster, jedoch keinen vollständigen
Online-Anmeldebildschirm. Die Produktion wird nicht kontaktiert. Es ist kein Test
über das Internet gegen einen bereitgestellten Netcup-Cloudserver.

## Fälle und Anforderungen

| Fall | Erwartung |
| --- | --- |
| TCP-Abbruch vor dem Import | Keine Cloudbuchung; lokal bestätigter Verkauf bleibt offen |
| TCP-Abbruch nach erfolgreichem Servercommit | Genau eine Cloudbuchung; lokal bleibt der Verkauf bis zur bestätigten Wiederholung offen |
| Native Laufzeit schließen und mit demselben Datenverzeichnis öffnen | Offene Verkaufs-ID und Daten bleiben erhalten |
| Erneute Synchronisierung | Dieselbe ursprüngliche Cloud-Auftrags-/Belegidentität; keine zusätzliche Zahlung |
| Fehlender Token, abgelaufene Sitzung, entzogene Inhaberrolle | Anmeldung/Fehler sichtbar; unveränderte offene Queue; keine neue Cloudbuchung |
| HTTP 503 und spätere Wiederanmeldung | Daten bleiben erhalten und werden erst nach erfolgreicher Antwort bestätigt |
| Gerät deaktiviert | Kein frischer Katalog; bereits gültig abgeschlossener historischer Barverkauf bleibt importierbar |
| Gerät wieder freigegeben | Katalogaktualisierung erholt sich ohne zweite Verkaufsbuchung |
| Abgleich | Drei eindeutige Aufträge, Zahlungen, Belege und Import-IDs; exakt 3 × 895 Cent, keine offene Queue nach bestätigtem Abschluss |

Der Prozess öffnet die native Laufzeit und die lokale Datenbank erneut; das ist kein
Neustart des Windows-Betriebssystems. Der Test startet keine Zahlung und versendet
keine E-Mail. Es werden nur synthetische Bargeldbuchungen erzeugt.

## Ausführung

GitHub-Workflow: `.github/workflows/offline-cloud-validation.yml` unter Windows.
Er installiert die vorhandenen Root-, `server/ai-tests`- und Desktopabhängigkeiten,
bereitet den gemeinsamen Offline-Verkaufsvertrag vor, prüft die Desktoptests und
startet anschließend `npx electron offline-cloud-smoke.cjs` in `apps/desktop`.
Der Workflow besitzt ausschließlich Leserechte und veröffentlicht keinen Installer.

Lokal bereits bestanden: 37 Desktoptests und ein echter Loopback-HTTP-Durchlauf mit
getrennten lokalen/Cloud-PostgreSQL-Motoren für Socketabbruch vor/nach Commit und
idempotente Wiederholung. Windows-CI [39009356850](https://github.com/akanal/Bringness-POS/actions/runs/39009356850)
auf `44f93ca` ist vollständig bestanden, einschließlich des tatsächlichen
Electron-/HTTP-/IPC-Durchlaufs und aller oben aufgeführten Fehlerfälle.

## Weiterhin offen

Der Windows-Paketierungslauf [39009356778](https://github.com/akanal/Bringness-POS/actions/runs/39009356778) ist ebenfalls erfolgreich; sein Artefakt ist ausdrücklich unsigniert.

GitHub-Punkt #78 bleibt wegen tatsächlicher Hardware-/Betriebsabnahmen offen:
58-/80-mm-Drucker, QR-Ziel am Kundenrechner, zertifizierte Offline-TSE und echte
Windows-Installation/Neustart mit signiertem Installer. Dieser Test ersetzt weder
Produktionsbereitstellung noch Herstellerfreigabe oder physische Geräteabnahme.

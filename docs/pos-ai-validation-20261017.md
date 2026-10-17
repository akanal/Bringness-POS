# Bringness POS / AI — Entwicklungsprüfung 17.10.2026 UTC

## Umfang und Freigabegrenze

Repository `akanal/Bringness-POS`, bestehender Branch `staging/preview-20261016`.
Ausgangspunkt `f0baf9022105a51e790f8b814ad036c2c542ddb0`.
Kein Merge nach main, keine produktive Bereitstellung, keine DNS-/Serveränderung,
keine echte Zahlung, Lieferantenbestellung, E-Mail oder Provideraktivierung.
Lokale und CI-Integration verwendet synthetische Daten und simulierte Anbieter.

## Behobene Fehler

| Punkt | Ursprüngliches Ergebnis / Ursache | Korrektur | Nachprüfung |
| --- | --- | --- | --- |
| Beschaffungsentwurf | Fehlgeschlagen in `integration.mjs:97`: PostgreSQL `numeric` kommt als Text, strenge Zahlenprüfung verwirft das Angebot | Datenbankmengen und Mindestwarenwerte an der Adaptergrenze normalisiert; positive endliche gebrochene Packungsgrößen zugelassen | Vollständige Integration einschließlich 0,5er-Packung / 16 Packungen bestanden; ungültige Typen bleiben gesperrt |
| Tagesprognose | Nach erster Reparatur Fehler in `integration.mjs:244`: SQL liefert Umsatzsumme ausdrücklich als Text | Umsatzsumme vor strenger Kernprüfung in Zahl umgewandelt; unsichere Ganzzahlen bleiben ausgeschlossen | Vollständige Prognose-, Historien-, Snapshot- und Mandantentests bestanden |
| Beschaffungsfreigabe-Test | Test erwartete beim erstmaligen Deaktivieren einen gespeicherten Einkaufsauftrag/Freigabedatensatz | Test prüft jetzt korrekt: erstes Deaktivieren legt keine Freigabe an; Aktivierung benötigt ausdrückliche Bestätigung; Widerruf und Audit bleiben atomar | `automatic-policy.mjs` bestanden |
| Staging-CI | Browser-/Release-/Integrationsworkflows liefen nicht bei Staging-Push | Bestehenden Staging-Branch in reine Prüfworkflows aufgenommen; Personal-, Gast-, Billing- und simulierte Fiskalprüfungen ergänzt | GitHub-Prüfläufe, siehe unten |
| Standard-Testkommando | Root `npm test` startete Browser-/Datenbanksuiten ohne ihre getrennten Abhängigkeiten; `test:unit` prüfte nur drei Dateien | Vollständiger Root-Unit-Runner; Browser und Datenbank-Lifecycle behalten eigene CI-Jobs; echte PDF/QR-Prüfung aktiviert | 413 Tests bestanden, null Fehler, null übersprungene Tests |

## Offline-HTTP-Wiederanlauf

Neue Suite `server/ai-tests/offline-http-sync.mjs` verbindet den nativen
Synchronisierer, das dateibasierte lokale Ledger, einen echten Loopback-HTTP-Server
und die produktive authentifizierte Offline-Route. Nur der Datenbankadapter wird
über den optionalen internen Handlerparameter übergeben; das HTTP-Format und die
Berechtigungslogik bleiben unverändert.

Geprüft: Socket-Abbruch vor Import, Socket-Abbruch nach Server-Commit,
Neustart der lokalen Datenbank, Wiederholung derselben Verkaufskennung,
401 nach Tokenverlust, 403 bei Rollenentzug, erfolgreiche erneute Anmeldung,
zwei Verkäufe mit exakt zwei Aufträgen/Belegen und insgesamt 3.580 Cent Zahlung.
Kein unsicherer Verkauf wird aus der lokalen Warteschlange entfernt.

Dieselbe Suite läuft zusätzlich gegen PostgreSQL 16 im isolierten zufälligen
Testschema der lokalen CI-Datenbank. Transaktionen verwenden ausgecheckte
Datenbankverbindungen. Externe Datenbankhosts werden vom Test abgewiesen.
Dies ist kein echter Electron-zu-Netcup- oder Hardware-TSE-Abnahmetest.

## Erfolgreiche lokale Prüffelder

- 413 Root-Tests einschließlich Billing, TSE-Fehlerzuständen, Belegen/PDF/QR,
  Autorisierung und Provisionslogik.
- 37 Desktop-Tests einschließlich dauerhafter Speicherung, Gerätebindung,
  verlorener Bestätigung und doppelter Belegzuordnung.
- 15 Operations-/Workflowtests sowie Staging-Preflight mit 15 abgewiesenen
  unsicheren Konfigurationen und Hostidentitätsprüfung.
- Sämtliche 31 vorhandenen nichtfiskalischen Integrationsskripte; der einzige
  anfänglich fehlgeschlagene Freigabetest wurde repariert und erneut bestanden.
- Zwei zusätzliche Fiskaly-Suiten mit vollständig simulierten TEST-Anbietern.
- Neue HTTP-Suite mit dauerhafter lokaler Datenbank.
- Admin-Audit, Gerätefreigabe, Passwortreset, Sitzungswiderruf,
  Steuerberaterfreigabe/-widerruf und eingefrorener 251-Beleg-Export.
- Personal/PIN, Dienstplan, mehrere Kellner pro Tisch, Bestellwiederholung,
  Gastabholung, Push-Zuordnung, Displaypersistenz und native Fernhilfeverträge.
- POS/AI-Brücke, Lager-Lifecycle, Lieferscheine, Beschaffungsfreigabe,
  Zahlungs-/E-Mail-Wiederholschutz und vollständiger POS/AI-Gesamtablauf.

## GitHub-Nachweise

- [Center validation 39005537560](https://github.com/akanal/Bringness-POS/actions/runs/39005537560)
  auf `08e1347`: Chromium und WebKit bestanden, einschließlich je 21 Browserfällen
  und PostgreSQL-16-Migration/Lifecycle.
- [POS/AI completion 39005537558](https://github.com/akanal/Bringness-POS/actions/runs/39005537558)
  auf `08e1347`: vollständige erweiterte Integration bestanden.
- [POS release validation 39005537549](https://github.com/akanal/Bringness-POS/actions/runs/39005537549)
  auf `08e1347`: Desktop-, Offline-, Wetter-/Beschaffungs- und TSE-Prüfung bestanden.
- [Windows Desktop 39005635911](https://github.com/akanal/Bringness-POS/actions/runs/39005635911)
  auf `e2899f0`: Installer gebaut; Offline-Oberfläche/IPC sowie native Fernhilfe
  mit Capture, Eingabe, Zustimmung und Stop bestanden. Zertifikat nicht
  konfiguriert; Artefakt `Bringness-POS-Windows-signed-false` ist ausschließlich
  ein unsignierter Testbuild. Öffentlicher Installer wurde nicht ersetzt.

Zusätzlicher geprüfter Codecheckpoint `99b645d8680af307da1c1c844a8f60e30206b4ba`:
[POS/AI completion 39005747877](https://github.com/akanal/Bringness-POS/actions/runs/39005747877)
führt die neue HTTP-Suite sowohl eingebettet als auch auf PostgreSQL 16 aus.
[Root-Tests 39005747878](https://github.com/akanal/Bringness-POS/actions/runs/39005747878)
und [Release-Regression 39005747909](https://github.com/akanal/Bringness-POS/actions/runs/39005747909)
sind erfolgreich. Die vollständige Integration ist ebenfalls erfolgreich,
einschließlich HTTP-Wiederanlauf auf PostgreSQL 16, gleichzeitiger
Geräteaktivierung, Personal-/Serviceabläufen und simulierter Fiskalprüfung.

## Offene Aufgaben nach Priorität

| Priorität | Offene Aufgabe | Tatsächliche Abhängigkeit / nächster Schritt |
| --- | --- | --- |
| P0 | Produktive Fiskalisierung | Anbieterfreigabe, reale Cloud-TSE-Konfiguration und zertifizierte Abnahme; simulierte Tests ersetzen dies nicht |
| P0 | Dauerhaft offline arbeitende Hardware-TSE | Swissbit-SDK/Evaluierungsgerät und Nutzungs-/Weitergabebedingungen; danach Geräteintegration und Abnahme |
| P0 | Echte Zahlungsabnahme | Isolierter Mollie-Sandboxbetrieb mit passenden Händlerzugängen, Checkout/Webhook/Wiederholung/Storno prüfen; keine Live-Belastung |
| P0 | Isolierter Netcup-Stagingbetrieb | Separater Runtime-/Datenbank-/Storage-/Ingress-Zugang und nachgewiesene sichere Anbieter-/Benachrichtigungsschalter; Produktionshandler nicht zweckentfremden |
| P1 | Modulvertrieb vollständig migrieren | Aktuelle Produktentscheidungen aus AGENTS.md beachten; abweichende ältere Issue-/PR-Preise sind keine Freigabe. Endgültige Modulpreise, Laufzeit und Zahlungsabnahme vor verbindlicher Aktivierung klären |
| P1 | Windows-Veröffentlichung | Echtes Organisationszertifikat fehlt (`CERT_CONFIGURED: false`); unsignierter Build ist keine öffentliche Freigabe |
| P1 | Kundengerät-/Druckerabnahme | Windows installieren/neustarten; tatsächlicher Electron-Cloud-Sync mit Netzunterbrechung; 58/80-mm-Bon, QR-Ziel und Scanner testen |
| P1 | Reale Mobilgeräte | Safari/iPad und Android-Standby/Push prüfen; Anbieterannahme ist kein Beleg für sichtbaren/akustischen Empfang |
| P1 | Sicherer Produktivübergang | Backups und isolierte Wiederherstellung, Rollback, Freigabe und Wartungsfenster gemäß `bringness-release-gates.md` |
| Zurückgestellt | Native iOS-Veröffentlichung | Nach bestehender Entscheidung kein Downloadangebot; Online-Kasse bleibt der vorgesehene Zugang |

Offene Issues #78, #65 und #36 sowie Entwurfs-PRs wurden gelesen, aber nicht
pauschal geschlossen oder gemergt. Bestehende Daten, Preise und produktive
Oberflächen wurden nicht verändert. Diese Prüfung bestätigt konkrete
Entwicklungsergebnisse, keine vollständige Produktionsreife.

## Gespeicherte Staging-Commits dieses Durchgangs

| Commit | Inhalt |
| --- | --- |
| `de531a6` | PostgreSQL-Mengen normalisieren und gebrochene Packungen unterstützen |
| `5b6a3e3` | Umsatzaggregat vor Prognosevalidierung normalisieren |
| `ffc5c52` | Erstmaligen Beschaffungswiderruf ohne neue Freigabe korrekt prüfen |
| `08e1347` | Staging-CI für Browser, Offline und vollständige POS/AI-Flows aktivieren |
| `269e662` | Echte HTTP-Verbindungsabbrüche und persistente Wiederholung prüfen |
| `e2899f0` | Windows-Build bei Änderung der gebündelten Offline-Regeln auslösen |
| `f444d99` | HTTP-Wiederanlauf zusätzlich auf isoliertem PostgreSQL 16 prüfen |
| `b0687e6` | Vollständige Root-Unit-Suite als Standardkommando bereitstellen |
| `99b645d` | PostgreSQL-Testtransaktionen an ausgecheckte Verbindungen binden |

Der abschließende Dokumentationscommit enthält diesen Bericht und korrigiert
die veraltete Aussage zur bereits implementierten nativen Fernhilfe. Er ändert
keinen ausführbaren Code.

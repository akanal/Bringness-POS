# Isolierte Bringness-POS-/AI-Vorschau

## Fertiggestellter Entwicklungsumfang

Der bestehende Staging-Branch enthält einen startbaren Vorschauaufbau für die
**tatsächliche** POS-Oberfläche und den getrennten AI-Arbeitsbereich. Er ersetzt
keinen Teil der produktiven Installation und veröffentlicht keine öffentliche URL.

| Bestandteil | Verhalten |
| --- | --- |
| `preview-app` | Originale Node-Anwendung als Nicht-Root-Benutzer, schreibgeschütztes Dateisystem, ausschließlich internes Docker-Netz |
| `preview-db` | Eigener PostgreSQL-16-Container mit eigenem Volume; separate POS-, AI- und Sprachdatenbanken gemäß bestehender Architektur; kein veröffentlichter Datenbankport |
| `preview-proxy` | Fester Proxy zur Vorschauanwendung, ohne Zugangsdaten und ohne frei wählbaren Zielhost; nur dieser Dienst besitzt ein Eingangsnetz; Port ausschließlich `127.0.0.1:3016` |
| Vorschauzugang | Separate HTTP-Basic-Zugangsdaten; Übergang in ein signiertes, einstündiges `HttpOnly; Secure; SameSite=Strict`-Cookie, damit die normale Bearer-Anmeldung von POS/AI erhalten bleibt |
| Anbieter | Vorhandene Live- **und** TEST-Anbieterzugänge werden beim Vorschau-Start abgewiesen; globale Server-Fetch-Sperre und internes Netzwerk verhindern externe Anfragen |
| Nachrichten/Fiskal | SMTP gesperrt; Mail-/Push-/Fiskal-/Einzugs-/Beschaffungs-Hintergrundläufe deaktiviert; direkte Anbieteraktionen gesperrt; `/health` weist `disabled_preview` aus |
| Browser | Keine Indexierung; kein Caching; CSP erlaubt Verbindungen und Formulare nur zur eigenen Vorschau; vorhandene POS- und AI-Oberflächen bleiben die Einstiegsseiten |
| Testdaten | Ein synthetischer Inhaber/Plattformadministrator, Restaurant, Tisch, zwei Artikel und ein getrenntes AI-Konto mit Standort/Lager; keine Anbieterzahlungen, Belege oder Bestellungen durch den Seed |

Der SMTP-Schutz und die Worker-Schalter wirken nur im ausdrücklich gesetzten
isolierten Vorschau-Modus. Normale Produktionsstarts bleiben im bisherigen Modus.
Ein isolierter Modus über den ungeschützten normalen Starteinstieg wird abgewiesen.

## Geprüfte Grenzen

Der erste Stack-Test startete Anwendung und Datenbanken und führte den Seed zweimal
korrekt aus. Der anschließende Hostzugriff scheiterte, weil das vollständig interne
Netz auch die unmittelbare Portveröffentlichung verhinderte. Die Korrektur ergänzt
einen separaten Loopback-Eingangsproxy; die Anwendung selbst erhält dadurch keinen
Internetweg.

GitHub-Lauf [39007659288](https://github.com/akanal/Bringness-POS/actions/runs/39007659288)
auf `a96a59d` ist erfolgreich:

- tatsächliches Anwendungsimage bauen und den vollständigen isolierten Stack starten;
- POS- und AI-Schema bereitstellen; Seed zweimal ohne doppelte Betriebe/Artikel;
- anonyme Aufrufe und manipulierte Vorschaucookies abweisen;
- tatsächliche POS-/AI-Dateien und beide Anmeldungen prüfen;
- synthetischen Barverkauf einmal buchen und identisch wiederholen;
- Zahlungs-, Fiskal-, Einzugs- und Beschaffungsaktionen vor Anbieterkontakt abweisen;
- tatsächliche POS-Anmeldung und AI-Lageransicht in Chromium durch einen temporären
  lokalen HTTPS-Proxy öffnen, ohne JavaScript-Seitenfehler;
- externe Browserverbindungen durch CSP abweisen;
- ausgehende TCP-Verbindung aus dem Anwendungscontainer erfolgreich verhindern.

Dieser CI-Aufbau verwendet nur kurzfristige Testzugänge und ein wegwerfbares Volume.
Die temporäre selbstsignierte HTTPS-Testverbindung ist kein Zertifikat für die
öffentliche Domain. Keine echte E-Mail, Push-Nachricht, Anbieterzahlung oder
Fiskalsignatur wurde ausgeführt. Vorhandene Provider-, Offline-, Steuerberater-,
Center- und POS/AI-Tests bleiben separate Nachweise.

## Abschließender Testbericht vom 17.10.2026

Geprüfter Codecheckpoint: `fdd4abaccec72858e994291713f534b935dd3e32`.

| Prüfung | Ergebnis | Ursache / nächster Fix |
| --- | --- | --- |
| Echter isolierter POS-/AI-Stack, Seed-Wiederholung, HTTPS-Browser, Egress-Sperre | Bestanden | [Abschließender Lauf 39007780203](https://github.com/akanal/Bringness-POS/actions/runs/39007780203); kein weiterer Codefix aus diesem Lauf |
| Vollständige POS-/AI-Integration einschließlich Offline-, Rollen-, Zahlungs- und Fiskalsimulationen | Bestanden | [Lauf 39007780179](https://github.com/akanal/Bringness-POS/actions/runs/39007780179); echte Anbieterabnahme bleibt separat |
| Center-/Browserprüfungen Chromium und WebKit | Bestanden | [Lauf 39007780204](https://github.com/akanal/Bringness-POS/actions/runs/39007780204) |
| Bringness-Grundprüfungen und POS-Releaseprüfungen | Bestanden | Läufe [39007780239](https://github.com/akanal/Bringness-POS/actions/runs/39007780239) und [39007780167](https://github.com/akanal/Bringness-POS/actions/runs/39007780167) |
| Lokale automatisierte Tests | Bestanden | 429 Root-, 37 Desktop- und 17 Operations-Tests; keine fehlgeschlagenen oder übersprungenen Tests |
| Erster direkter Loopback-Zugriff aus internem Docker-Netz | Fehlgeschlagen, behoben und erneut bestanden | Portveröffentlichung bei ausschließlich internem Netzwerk nicht erreichbar; separater fester Eingangsproxy in `a96a59d` behebt den Fehler ohne App-Egress |
| Öffentliche Netcup-Vorschau, DNS/TLS, tatsächlicher Host-Wiederanlauf | Nicht ausgeführt | Separater freigegebener Host und Ingress noch erforderlich; Einrichtung und Abnahme erst dort |
| Reale Anbieter-/Hardware-/Signaturabnahme | Nicht ausgeführt | Benötigt passende externe Zugänge, SDK/Hardware beziehungsweise Zertifikat; Simulationen ersetzen diese Abnahme nicht |

Gespeicherte Codecommits auf `staging/preview-20261016`:

- `31f2162`: geschützter Vorschau-Starteinstieg und Anbieter-/Egress-Richtlinie.
- `fbc1b50`: Hintergrundzustellung, Fiskal- und Beschaffungsläufe isolieren.
- `15599f3`: schreibgeschütztes Anwendungspaket, private Datenbank und unabhängige Geheimnisse.
- `0bf9489`: echter Stack-, Wiederanlauf-/Seed- und Browsernachweis.
- `a96a59d`: erreichbarer Loopback-Eingang bei unverändert gesperrtem App-Egress.
- `fdd4aba`: ungeschützten Start verweigern und deaktivierte Zustellung korrekt ausweisen.

## Vorbereitung auf einem freigegebenen isolierten Host

Erst nach bestätigter Host-/Datenisolation ausführen. Der vorhandene produktive
Netcup-Operationshandler ist dafür kein Ersatz. Keine Produktions-Env-Datei,
keinen bestehenden Kundendatenbankzugang und keine produktiven Volumes verwenden.

```bash
node ops/create-preview-env.mjs .env.preview.local
docker compose --env-file .env.preview.local -f ops/isolated-preview.compose.json build
docker compose --env-file .env.preview.local -f ops/isolated-preview.compose.json up -d --wait --wait-timeout 180
docker compose --env-file .env.preview.local -f ops/isolated-preview.compose.json exec -T preview-app node server/preview-seed.mjs
```

Die neue Zugangskonfiguration wird nur mit Modus `0600` angelegt; vorhandene Dateien
werden nicht überschrieben. Vorschauzugang: Benutzer `bringness-preview`, Passwort
`PREVIEW_ACCESS_PASSWORD` aus der privaten Konfiguration. POS und AI nutzen jeweils
`preview@example.test` und `PREVIEW_OWNER_PASSWORD`. Beide Anmeldungen bleiben
technisch getrennt. Passwörter nicht in Chat, Tickets oder öffentliche Logs kopieren.

Die private Konfiguration und das zugehörige Vorschauvolume zusammen erhalten.
Ein erneuter Seed überschreibt keine bestehenden Testdaten oder Zugangshashes und
verweigert fremde nicht markierte Datenbestände. Zur Unterbrechung genügt:

```bash
docker compose --env-file .env.preview.local -f ops/isolated-preview.compose.json stop
```

Keine Volume-Löschung für normale Neustarts. Die CI entfernt ausschließlich ihren
selbst erstellten kurzlebigen Testaufbau nach Abschluss.

## Was weiterhin extern offen bleibt

- Freigegebener separater Netcup-Staginghost/-Zugang und dessen tatsächliche Isolation.
- DNS/TLS und geschützter öffentlicher Ingress für `demo.bringness-pos.de`.
- Vor öffentlicher Freigabe: Konfiguration, Datenhaltung, Sicherung und Wiederanlauf
  auf genau diesem Host nachweisen; aktuellen getesteten Commit fest angeben.
- Reale Mollie-/Terminal- und TSE-Abnahme: In dieser Vorschau absichtlich gesperrt,
  auch für TEST-Zugangsdaten. Das ist keine echte Anbieter-Sandbox.
- Hardware-TSE/SDK, Windows-Signaturzertifikat, Drucker-/Scanner-/Kundengeräteabnahme
  sowie abschließend bestätigte Modulvertriebsbedingungen.

E-Mail-Aktivierung, reale Push-Zustellung, aktuelle Wetterbeschaffung und automatische
Lager-/Beschaffungs-/Einzugsläufe sind in dieser isolierten Vorschau nicht freigegeben.
Die vorbereiteten synthetischen Konten erlauben die UI-Prüfung ohne solche Dienste.
Der Seed aktiviert nur zeitlich begrenzte synthetische Funktionsfreigaben und erzeugt
keine bezahlte Lizenz, Rechnung oder Kundenabbuchung.

## Ergänzung: Datenwiederherstellung und nativer Offlineabgleich

Verschlüsselte Vorschauarchive, Wiederherstellungsprüfung in einer unabhängigen
PostgreSQL-Instanz und der Abgleich derselben Barverkaufs-ID nach Neustart sind in
`isolated-preview-recovery.md` beschrieben. Den tatsächlichen Windows-Electron-
HTTP-Abgleich einschließlich Socketabbrüchen, Sitzungsablauf und Rechteentzug
dokumentiert `offline-electron-http-recovery.md`. Diese Entwicklungsnachweise
ändern nichts am weiterhin ausstehenden öffentlichen Netcup-Stagingbetrieb.

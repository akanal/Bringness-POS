# POS: automatische Admin-Fehlermeldungen — 16.11.2026

Veröffentlicht über PR [336](https://github.com/akanal/Bringness-POS/pull/336).
Featurecommit: `742e465ab91b19b0ece70f042a4790878d9327d9`.
Geprüfter Quellbaum: `43a5a84cba20e25e2f7c009184213ccf23f6fa5a`.
Merge und tatsächliche Live-Version: `9415f9e17140cbc07f862cdebc6d9f3239e29489`.

## Verhalten

Fehlercodes erscheinen nur nach einem erkannten Fehler. Angemeldete Kassen melden
technische Fehler best-effort an den eigenen Adminbereich. Erwartete fachliche
Ablehnungen bleiben lokal. Die Plattformverwaltung sieht unter Admin → POS →
Automatische Fehlermeldungen gebündelte Fälle, Anzahl, Betrieb und Version und kann
sie in Bearbeitung nehmen oder als behoben markieren. Neue Vorkommen öffnen
behobene Fälle wieder. Hintergrund-Verbindungsfehler werden gemeldet, ohne den
konkreten lokalen Aktionscode zu überschreiben. Statusänderungen prüfen Revision
und aktuelle Plattformrechte; Kontowechsel entfernt auch verspätete UI-Antworten.

Keine Rohfehler, Formulare, Passwörter, Kundendaten, Beleginhalte oder automatischen
Reparaturen. Optionale Betriebs-UUID und Mandant werden serverseitig geprüft.
Vor der Anmeldung/blockiertem Sitzungsspeicher nur lokale Diagnose. Flüchtige
Browserwarteschlange: höchstens20 Ereignisse/15min, Kategorie je Betrieb2min
gedrosselt, maximal3 Übertragungsversuche derselben Kennung. Seitenende/Wechsel
verwirft die Warteschlange. Keine Wiederholung fachlicher Schreibanfragen.
Server: 12 Ereignisse je Nutzer/120 insgesamt je Minute; Ereignis-Deduplizierung24h,
inaktive Fälle30Tage, Start-/Stundenbereinigung. Kein externer Versand.
Frühe Reaktion ist möglich; Meldung vor der ersten Bedienerwirkung ist nicht garantiert.
Anleitung: [pos-diagnostic-codes.md](pos-diagnostic-codes.md).

## Prüfungen

Lokal: 736 allgemeine Prüfungen, bestehende POS-Diagnose, neue API-Abnahme mit PGlite
und elf Zustellungs-/Admin-DOM-Prüfungen erfolgreich. Native Tests wurden in CI
mit echten Browsern ausgeführt, nicht als lokaler Sandbox-Lauf ausgegeben.
Alle sieben PR-Workflows am exakten Featurecommit erfolgreich:

- Bringness checks: [43864957197](https://github.com/akanal/Bringness-POS/actions/runs/43864957197).
- POS release validation: [43864957317](https://github.com/akanal/Bringness-POS/actions/runs/43864957317).
- POS colour and navigation validation: [43864957268](https://github.com/akanal/Bringness-POS/actions/runs/43864957268).
- Isolated POS AI preview validation: [43864957205](https://github.com/akanal/Bringness-POS/actions/runs/43864957205).
- POS and AI completion validation: [43864957188](https://github.com/akanal/Bringness-POS/actions/runs/43864957188).
- Center validation: [43864957169](https://github.com/akanal/Bringness-POS/actions/runs/43864957169).
- Shop integration validation: [43864957263](https://github.com/akanal/Bringness-POS/actions/runs/43864957263).

PostgreSQL16: parallele gleiche Ereignisse zählen einmal; Konflikt zwischen
neuem Vorkommen und Abschluss lässt den Fall offen. Rechte, strikte Felder,
Mandantentrennung, Rate-Limits, Revisionen, Wiederöffnung und Aufbewahrung geprüft.
Chromium und WebKit: je38 native POS-Fälle ohne Fehler, darunter voller POS mit
automatischem Bericht nur nach technischem Fehler. Shop:897 Prüfungen und echter
Produktions-Einstieg mit isolierter PostgreSQL-Datenbank/Browser erfolgreich.
Keine produktiven Testumsätze, Kundendatenänderungen oder absichtlichen Fehlerberichte.

## Veröffentlichung und Live-Abgleich

Netcup [43866109383](https://github.com/akanal/Bringness-POS/actions/runs/43866109383),
Job133294957761 erfolgreich. Protokoll16.11.2026,12:25:48UTC (13:25:48Europe/Berlin):
`pos deployed: 9415f9e17140cbc07f862cdebc6d9f3239e29489`.
`Previous container retained. Database backup retained.`
Die vorgeschalteten PGlite-/echten PostgreSQL-Diagnoseprüfungen ebenfalls erfolgreich.

Live lesend geprüft am 2026-11-16T12:27:07.599899+00:00:

- POS, separate Bestandsseite und Adminseite:HTTP200, neue Skriptreferenzen vorhanden.
- Alle drei geänderten JavaScript-Dateien bytegleich mit dem geprüften Quellbaum.
- Health:HTTP200, status=ok, database=ok.
- Ohne Sitzung Diagnoseannahme401 und Adminübersicht403.
- Kein angemeldeter produktiver Störfall künstlich ausgelöst. Die funktionalen Meldungs-/Statusfälle wurden mit synthetischen Daten isoliert abgenommen.

| Datei | SHA256 |
| --- | --- |
| /pos/diagnostic-delivery.js | `a5ffc8784ba7cdf3ef7fcc0d50f000ed3c39b641855bf4c75feeb19505c0a0d3` |
| /pos/diagnostics.js | `2f546bfd792cb226cd5434d7fa751802f1d598ee6d5b7823d2f5625de7f6b66c` |
| /admin/platform-hub.js | `384150e046b5ea2828fa977dcedde5ab0bd2b4e15fdab875cb5b8729f940db1f` |

Dieser Nachweis ist eine reine Dokumentationsfortschreibung. Er ist kein neuer
Anwendungsstand und ersetzt nicht die oben genannte tatsächlich veröffentlichte Revision.

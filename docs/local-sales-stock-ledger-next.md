# Lokales Folgepaket: Verkaufsimport und Bestandsverwaltung

Basis: 0e13528. Alle bisherigen Pakete bleiben erhalten. Lokaler Entwicklungszweig work/sales-stock-ledger-next. Kein Upload und keine Live-Schaltung.

## Calculate sales ingredient effects exactly with compatible rounding

Neue Verkaufsereignisse summieren Rezeptprodukte als exakte ganze Teilmengen und runden anschließend pro Zutat einmal. Die bestehende Verkaufsregel bleibt erhalten, einschließlich negativer halber Tausendstel Richtung null. Küchenannahme behält ihre eigene Aufrundungsregel. Geprüfte Bestandsdeltas erhalten negative historische Bestände, verhindern aber beschädigte oder übergroße Endwerte.

## Revalidate restaurant authority before sales and reversal imports

Verkaufsimport, Testimport und ausdrücklich ausgelöste Rückbuchung prüfen das aktive Restaurantkonto unter der bestehenden Kontosperre. Die frische Verbindungs-, Firmen- und Standortprüfung bleibt zusätzlich erhalten.

## Use exact ingredient effects in the actual sales import path

Der echte Import verwendet die neue exakte Summierung. Ereigniskennungen und Fingerprints bleiben unverändert. Bereits gespeicherte Ereignisse werden vor jeder Neuberechnung erkannt; ihre historischen Lagerwirkungen werden nicht nachträglich umgerechnet.

## Validate immutable sale effects before reversing ingredient consumption

Rückbuchungen verwenden weiterhin ausschließlich gespeicherte Originaleffekte. NaN, überpräzise Werte oder eine unerwartet positive ursprüngliche Verbrauchswirkung werden statt einer fehlerhaften Gegenbuchung abgewiesen. Historische Nullwirkungen bleiben zulässig. Eine finanzielle Erstattung wird weiterhin nicht automatisch in Warenrückgabe umgewandelt.

## Prevalidate and lock all resulting sales balances before event writes

Alle betroffenen Zutaten werden in stabiler Reihenfolge gesperrt und ihre Endbestände geprüft, bevor ein Ereignis oder eine Lagerbewegung geschrieben wird. Testimport und echter Import verwenden dieselbe Berechnung. Der echte Import speichert die vorab geprüften Endwerte atomar; Testimporte rollen weiterhin vollständig zurück.

## Recheck restaurant authority before creating initial stock

Anfangsbestände werden nur angelegt, wenn das zuvor authentifizierte Restaurantkonto auch innerhalb der Schreibtransaktion noch aktiv ist. Die Kontosperre bleibt bis einschließlich Anfangsbewegung und Commit gehalten.

## Authorize stock corrections and calculate their audit differences exactly

Bestandskorrekturen prüfen das aktive Restaurantkonto erneut. Ihre Audit-Differenz wird aus ganzen Tausendsteln berechnet; negative historische Ausgangsbestände bleiben korrigierbar. Ein beschädigter Ausgangswert führt zum Rollback statt zu einer ungültigen Auditmenge.

## Capture exact before and after balances for sales stock movements

Neue Verkaufs-/Rückbuchungsbewegungen erhalten die tatsächlich geprüften Vorher-/Nachherbestände. Historische Bewegungen werden nicht rekonstruiert. Der Bewegungs-Kindwert bleibt unverändert, damit Verkaufsereignisse nicht zusätzlich als Küchenverbrauch in Prognosen zählen. Rückwärtsverträgliche Spaltenergänzung wird nur lokal an Testdatenbanken geprüft; keine Produktivmigration.

## Keep financial-only POS orders from blocking merchandise stock synchronization

Bezahlte Aufträge ohne produktbezogene Position erzeugen keinen Rezeptverbrauch und werden aus der Lager-Warteschlangenauswahl herausgehalten. Ein nachfolgender Warenverkauf wird trotzdem übernommen. Gemischte Belege verarbeiten weiterhin ausschließlich ihre Produktpositionen; Zahlungen, Pfand-/Finanzzeilen und Belege werden nicht geändert.

## Prüfbericht – 22.10.2026

| Prüfung | Ergebnis | Ursache / nächster Fix |
| --- | --- | --- |
| Gesamte Einzeltestsuite `npm test` | Bestanden: 573, keine fehlgeschlagen/übersprungen | Kein offener Fehler in diesem Lauf |
| Lagerlebenszyklus / Inventur / UI | Bestanden: 39 Szenarien | PGlite und JSDOM; Geräteabnahme bleibt offen |
| POS-/AI-Brücke | Bestanden: 37 Szenarien | Separate lokale PGlite-Engines; keine echten parallelen PostgreSQL-Verbindungen |
| Vollständige AI-Integration einschließlich neuer Verkaufsledger-Fälle | Bestanden, Prozesscode 0 | Präzision, Vorschau ohne Schreiben, Wiederholung, unveränderte Originalrückbuchung nach Rezeptänderung, Überlauf-Rollback, beschädigte Originalwirkung, Kontosperre, Auditwerte und Finanzbelegüberspringen geprüft |
| Erster Lauf der neuen Integrationsfälle | Fehlgeschlagen, behoben | Die zuvor im Test widerrufene Sitzung wurde wiederverwendet. Neue Anmeldung für diesen Testabschnitt ergänzt; kompletter Folgelauf bestanden |
| Neue Berechtigungssperren unter echter Parallelität | Offen | Test mit mehreren PostgreSQL-Sitzungen vor Freigabe ausführen; die Sperrung zwischen Authentifizierung und BEGIN wurde bislang deterministisch simuliert |
| Produktivsystem / Kundenhardware | Nicht ausgeführt | Kein Upload, keine Migration auf externen Datenbanken, kein Deployment; spätere Abnahme gemäß gemeinsamer Testliste |

Der Integrationslauf enthält erwartete Versandfehler aus Fehlerszenarien (`ETIMEDOUT`) und die bestehende isolierte Küchen-Stufendiagnose `commands 42703` der reduzierten Gesamttest-Fixture. Diese Meldung ist keine Bestätigung dieser Küchenstufe; deren separate Lebenszyklus-/Brückensuiten sind bestanden. Vor Freigabe bleibt die Prüfung des vollständigen Produktionsschemas im isolierten PostgreSQL-System erforderlich.

Neun Codeänderungs-Commits: `43ebabb`, `32f80f9`, `5d34828`, `fc50656`, `fb06f27`, `147b006`, `c44efbb`, `d3c599f`, `087af41`. Der folgende Abschlusscommit enthält die korrigierte Testanmeldung und diesen Nachweis. Dieses Paket ist lokal fertig implementiert und automatisiert geprüft; eine vollständige Produktabnahme wird damit nicht behauptet.

## Fortsetzung – Transaktionsfehler und echte Paralleltests vorbereitet

- Commit `92fb1b1`: Der reduzierte POS-Gesamttest besaß keine `attempts`-Spalte für Lageraufträge. Diese Fixture ist ergänzt; ein expliziter Lauf aller drei leeren Synchronisationsstufen schlägt nun bei verschluckten Schemafehlern fehl. Die bisher dokumentierte `commands 42703`-Meldung tritt im neuen Gesamtlauf nicht mehr auf. Dies bestätigt die leeren Stufen; befüllte Küchenabläufe sind weiterhin durch ihre separaten Suiten abgedeckt.
- Derselbe Commit injiziert einen echten Abbruch nach dem Schreiben des Verkaufsereignisses und eines Bestandsupdates, aber vor der Lagerbewegung. Geprüft: beide Zutaten unverändert, kein Ereignis, keine zusätzliche Bewegung; Wiederholung mit derselben Kennung bucht beide Zutaten einmal, erneute Wiederholung bleibt ohne weitere Bewegung. Auch negativer Endbestand für bereits bezahlte Verkäufe bleibt erhalten.
- `server/ai-tests/sales-ledger-races.mjs` führt die echten Anwendungstransaktionen gegen getrennte PostgreSQL-Verbindungen aus: gleichzeitige Wiederholung, verschiedene Verkäufe ohne verlorene Updates, konkurrierende Rückbuchungen, Kontosperre, Verbindungsentzug und nach Zeilensperre frisch gelesener physischer Bestand. Es beobachtet Datenbanksperren statt feste Wartezeiten zu verwenden und räumt das zufällige Testschema anschließend auf.
- Der vorhandene isolierte Prüfworkflow ist um diesen Paralleltest und den vollständigen AI-Test ergänzt. Er enthält keine Veröffentlichung oder Bereitstellung. Weder hochgeladen noch auf GitHub gestartet.

| Neue Prüfung | Ergebnis | Ursache / nächster Schritt |
| --- | --- | --- |
| Einzeltests nach Fortsetzung | Bestanden: 573/573 | Kein Fehler, nichts übersprungen |
| Vollständige AI-Integration mit Abbruch/Rollback | Bestanden, Prozesscode 0 | Erwartete Fehlerausgaben: simulierter Mailfehler und injizierter API-Abbruch; keine Küchen-Schemafehlermeldung |
| Schutz des neuen Paralleltestprogramms | Bestanden | Fehlende URL, entfernter Host und produktiver Datenbankname werden vor Verbindungsaufbau abgewiesen |
| Syntax und Patchprüfung | Bestanden | `node --check`, `git diff --check` |
| Tatsächlicher Lauf des neuen PostgreSQL-Paralleltests | Blockiert, nicht als bestanden gezählt | Lokal fehlen PostgreSQL und Docker; Paketbereitstellung scheitert an Prozess-/Benutzerrechten der Umgebung. Nächster Schritt: auf isoliertem PostgreSQL über den vorbereiteten Workflow oder lokal ausführen |

Start bei bereitgestellter Wegwerfdatenbank: `STOCK_AUTH_TEST_DATABASE_URL=postgres://device_test:device_test@localhost:5432/bringness_device_test node server/ai-tests/sales-ledger-races.mjs`. Ausschließlich lokale Testdatenbank dieses Namens zulässig. Keine Änderung der Anwendungsrundung, Oberfläche oder Produktionsdaten in dieser Fortsetzung.

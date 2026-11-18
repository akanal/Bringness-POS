# POS-Adminbackend: Übersicht und Protokoll

Fortsetzung des Eigentümerauftrags nach dem veröffentlichten Steuerberaterblock. Das bestehende Backend wird ergänzt; Windows/Offline bleiben gesperrt, AI folgt nach POS. Keine neuen Rechte, Preise, Anbieteraktivierungen oder produktiven Testdaten.

## Behobene Lücke

Im ursprünglichen Server war `/api/v1/platform/overview` doppelt definiert. Der erste Handler liefert Zahlen für die vorhandene Systemübersicht. Der spätere, unerreichbare Handler sollte Kunden- und Preislisten für die POS-Verwaltung liefern. Die Adminseite behandelte die Zahl als Liste und versteckte daraufhin ihre Plattformübersicht.

Die neue `/api/v1/platform/control/overview` ist ausschließlich für diese POS-Ansicht zuständig. Der bestehende numerische Vertrag und seine Verbraucher bleiben erhalten; der unerreichbare zweite Handler entfällt. Der neue Handler ist im tatsächlichen POS-Programmeinstieg vor der allgemeinen Plattformsteuerung eingebunden, nicht als AI-Erweiterung.

## Umfang

- Gleicher berechtigter Plattforminhaber mit aktiver Sitzung, aktivem Konto und erledigtem Startpasswortwechsel. Sitzung, Benutzer und Plattformfreigabe werden innerhalb derselben Transaktion unter kompatiblen Lesesperren geprüft. Ein bereits berechtigter Lesevorgang darf enden; bestätigter Widerruf/Logout verhindert einen danach begonnenen Zugriff. Keine Konto-/Freigabeänderung durch die Übersicht.
- Gesamtzahlen für alle Kundenkonten, Betriebe, aktiv markierten Module und erfassten Lizenzzahlungen stammen aus einem gemeinsamen SQL-Lesestand. „Aktiv“ ist der gespeicherte Modulstatus, kein neuer Nachweis produktiver Zahlungs-/TSE-Bereitschaft.
- Maximal die neuesten 250 Kunden, stabil nach Anlagezeit/ID sortiert. Pro Kunde Modulstatus, Betriebsanzahl, vorhandene Inhaber-/Admin-E-Mail und nur die letzte Zahlung. Die Anzeige weist auf die begrenzte Liste hin; Gesamtzahlen bleiben vollständig. Die vorhandene separate Kundensuche und Kundenansicht bleiben bestehen.
- Vorhandene drei zentralen POS-Preise werden aus der Datenbank gelesen. Keine Änderung der Beträge, Freigaben oder Kaufabläufe durch Lesen der Übersicht. Kein Zahlungs-/Beleg-/Personaldatenpaket pro Kunde laden.
- Netzwerkfehler, Serverfehler oder unpassende Antwortverträge melden einen Ladefehler. Nur eine tatsächliche 403-Antwort führt zur bisherigen Ansicht für fehlenden Plattformzugang. Keine automatische Ersteinrichtung.
- Neuere Übersichtsantworten gewinnen gegenüber älteren; verspätete Übersichts-/Betriebsprotokollantworten nach Sitzungswechsel oder Seitenende werden nicht angezeigt. Änderung der Anmeldung in einem anderen Fenster leert die betroffenen Daten und zeigt die Anmeldung.
- Der vorhandene Betriebsprotokoll-CSV-Export bleibt mandantengebunden, datumsbegrenzt in Europe/Berlin, gegen Tabellenformeln geschützt und auf 10.000 Einträge begrenzt. Aktueller Benutzer und Sitzung werden innerhalb der Exporttransaktion unter Lesesperre geprüft. Clientseitig keine doppelten Downloads und kein Download einer verspäteten Antwort nach Konto-/Zeitraumwechsel oder Seitenende, einschließlich verspäteter Dateibytes.

## Prüfungen

`server/ai-tests/pos-admin-backend.mjs` führt echte SQL-Abfragen mit isolierten Daten aus: 253 Kunden, 1002 Zahlungen, vollständige Zähler trotz begrenzter Liste, eine letzte Zahlung, bestehende Rollen-/Sitzungsgrenzen, Betriebsprotokoll ohne Fremdmandant und ausbleibende Schreibaktionen. Die PostgreSQL-Variante prüft gleichzeitig bestätigten Plattformwiderruf und Logout gegen wartende Leseanforderungen. Ausschließlich explizite lokale Testdatenbank zulässig.

`server/ai-tests/pos-admin-ui.mjs` verwendet die tatsächlichen Adminskripte: beide unterschiedlichen Übersicht-Verträge, sichtbare Module, Fehler/Berechtigung, umgekehrte Antwortreihenfolge, Kontowechsel während Anmeldung/Laden, Seitenende, Doppelklick und verspätete CSV-/Blob-Antworten. Die gemeinsame Navigationsfixture bildet den numerischen Legacy-Vertrag jetzt korrekt ab und verdeckt den ursprünglichen Fehler nicht mehr.

Der bestehende native Adminfall prüft zusätzlich Übersicht/Module und verspätete Downloads nach Datums-/Kontowechsel bei 390/1280px in Chromium und WebKit. Bestehende Navigation und Protokollregression bleiben erhalten. Finale CI-, Deployment- und Live-Ergebnisse werden nach tatsächlichem Abschluss im Release-Nachweis ergänzt.

Dieser Block vervollständigt die beschriebenen Adminfunktionen. Er ist keine pauschale Fertigmeldung sämtlicher Admin-/Backendbereiche und kein offizieller DSFinV-K-Export.

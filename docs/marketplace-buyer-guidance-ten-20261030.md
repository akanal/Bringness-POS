# Käuferhilfe — Zehnerblock 30.10.2026

Fortsetzung der beauftragten Orientierung für Käufer und Verkäufer. Verkäuferhilfe ist PR195; dieser Block ergänzt ausschließlich geladene Käuferbestellungen, keine neue Bestell- oder Zahlungsfunktion.

1. Vorhandene authentifizierte Käuferhistorie und bestätigte Statuswerte wiederverwenden.
2. Eingegangen klar von Händlerannahme unterscheiden.
3. Angenommene Versandbestellung: auf Versandmeldung warten, kein erfundener Termin.
4. Angenommene Abholbestellung: auf Abholbereit warten.
5. Abholbereit: gespeicherte Hinweise prüfen; kein Zahlungsnachweis.
6. Versandmeldung: Händlerangabe von Zustellnachweis unterscheiden; fehlende Sendungsnummer offen anzeigen.
7. Abgelehnt/storniert: keinen Versand versprechen, keinen Erstattungsnachweis behaupten.
8. TEST-Vorgänge priorisiert als keine echte Zahlung/Warenfreigabe erklären; unbekannte Zustände ohne Handlungsgarantie behandeln.
9. Dezente native Aufklapphilfe, standardmäßig geschlossen; keine neue Speicherung, kein Schreiben, keine Anzeige privater Empfängerdaten. Kontowechsel und Datenschutz-Reset entfernen die Hilfe zusammen mit der Bestellung. Auf zuletzt geladenen Stand und explizite Aktualisierung hinweisen.
10. Status- und UI-Tests sowie tatsächliche PostgreSQL/Browserprüfung bei390/768/1280; tatsächliche Ergebnisse, Backup und Live-Prüfung separat eintragen.

Keine Preis-/Design-/POS-/Kellneränderung, Anbieterabfrage, echte Händlerabnahme, Zahlung, Bestellmutation, Kontakt-Nachricht oder Garantie aus dieser Hilfe ableiten. Reale Zahlungsfreigabe bleibt von der UI getrennt. Keine Produktionsbestellungen zur Funktionsprüfung anlegen.

## Verifiziertes Ergebnis

PR196 Featureb63c9d4ab3d96a14eddbd9abec2e35bbd3064133 bestand alle vier Workflows: Shop41136108471/job124338850872 (713 Tests, keine Fehler/Skips, tatsächlicher PostgreSQL-Anwendungsstart und native Chrome-Käuferhilfe bei390/768/1280), isolated41136108487, checks41136108488, release41136108477. Lokaler Statustest bestanden. Mobile/Desktop-Ansichten aus Artefakt13016437837 geprüft.

Backup41136561033/job124340348142: Database backups validated. Merge7dfb43e4f56b94363fa9c93316211e447bb62842 erfolgreich über Netcup41136953674/job124341638610 veröffentlicht, exakte Revision und erhaltene Vorgängercontainer/DB-Sicherung bestätigt.

Öffentlich ausgelieferte buyer-next-step.js und market-order-ui.js bytegleich mit geprüftem Quellstand. Bestehende guided-offer.js/CSS ebenfalls bytegleich; bringness.de200 Marktplatz, bringness-pos.de200, IDrive configured/available true; nicht angemeldete Händlerbereitschaft401. Keine echte Käuferbestellung angelegt oder private Produktionsbestellung zur Prüfung gelesen. Funktionsabnahme mit isolierten Testbestellungen, nicht mit einem vorgetäuschten echten Kauf.

# Optionale Vorbereitungszeitfenster

Stand: 19.11.2026. Erweiterung unter Lager & Küche → Verderbvermeidung und Vorbereitung → Vorbereitung nach Tageszeit. Standortweise eigene Frühstück-/Mittag-/Abendfenster auswählen und ausdrücklich speichern. Anfangs bleibt die bisherige Aufteilung vor/ab 17 Uhr erhalten. Vorbereitungs- und Verderbschalter bleiben unabhängig.

## Rechenvertrag
Ganze Zahlungsstunden aus vorhandener Artikelhistorie in Europe/Berlin; Beginn inklusive, Ende exklusiv. Ein bis drei eindeutige Fenster, keine Überschneidungen. Ende 00:00 bedeutet Mitternacht; Fenster über Mitternacht behalten die vorhandene Kalender-Tageszuordnung. Keine Behauptung tatsächlicher Küchen-/Reservierungszeiten.

Relative Artikelmengen über dieselben Vergleichstage verteilen die bisherige Tagesprognose per größtem Rest auf die Fenster plus „Außerhalb der Zeitfenster“. Ganze Portionen und pro Zutat auf drei Nachkommastellen gerundete Tagesmengen bleiben erhalten. Fehlende oder ungültige Stunden ergeben unbekannte Fensterwerte statt geschätzter Aufteilung. Tagesmengen bleiben sichtbar.

## Speicherung und Kompatibilität
Additive, wiederholbare service_windows-JSONB-Spalte an den vorhandenen Standort-Einstellungen. Bestehende Betreiberrechte, Standortprüfung, Transaktion, Versionskonflikt und Audit bleiben bestehen. Ohne Feld bleiben gespeicherte Fenster erhalten; explizites null stellt die bisherige Aufteilung wieder her. Abschalten der Vorbereitung löscht keine gespeicherten Fenster. Ändert sich die Einstellungsrevision während einer Berechnung, wird deren veraltetes Ergebnis verworfen.

Keine Bestandsbuchung, Bestellung, Preisänderung oder produktive Testdaten. Windows-/Offline-Dateien unverändert.

## Technische Prüfung
- 776 allgemeine Node-Prüfungen bestanden, einschließlich neuer Fenstergrenzen, Übernacht-/Fehlstunden, Mengen- und Zutatenkonservierung sowie ungültiger/überlappender Fenster.
- learning-assistant.mjs mit zwei isolierten PGlite-Datenbanken bestanden: wiederholbare Migration, Standortrechte, Speicherung, alte API-Aufrufe, Konflikte, Reset, echte Berechnung und Einstellungswechsel während der Berechnung.
- Vollständige AI-Integration inklusive DOM-Eingabe/Speichern/Neuladen/Überschneidungsfehler/Reset bestanden.
- Native PostgreSQL-Prüfung in den bestehenden CI- und Deployment-Pflichtläufen bestanden; lokal kein PostgreSQL-Dienst verfügbar. Praktische Restaurantabnahme bleibt verschoben; synthetische Tests sind kein Nachweis realer Prognosegüte.

Code-Upload, CI und tatsächliche Livebereitstellung werden separat nachgewiesen. Deployment-Anforderung ausschließlich target ai über den bestehenden Sicherungs-/Rückfallweg.

## Verifizierte Veröffentlichung
- PR358, geprüfter Feature-Commit f342b3a2e174a90a9c94dae3e53755a11a7a3220, Quellbaum 490ee25af5e7327cf11e56227145c1c78bb75f9d.
- Alle fünf PR-Prüfläufe erfolgreich: Bringness44530139328, POS release44530139651, isolierte Vorschau44530139480, Center44530139388 (Chromium/WebKit), POS/AI44530139409 (job135580943100, einschließlich PostgreSQL16).
- Merge91c71a4a3c2d8fc5e421a6f7dc6e404e56f433e9 hat denselben geprüften Quellbaum. Netcup44530920977/job135583691874 erfolgreich; authentifiziertes Log 19.11.2026 13:13:52 UTC bestätigt target ai und exakt diese Deploymentrevision. Vorheriger Container und Datenbanksicherung erhalten. Wiederholte PostgreSQL-/DOM-Prüfung im Deployment ebenfalls erfolgreich.
- Live https://bringness-ai.com/ai-workspace.html und /ai-workspace.js jeweils200 und bytegleich zur geprüften Quelle. SHA256 HTML8e8125a186758bd993913679701bcc68f105bc51581cb6e486ded8dd90ab9dac, JS0741b90b2e82417a164f031dc29db6a7b196635e526d6c9008671b79b52f32e9.
- Live /health200, status:ok/database:ok; Küchen-API ohne Sitzung401. Keine produktiven Standort-Einstellungen, Artikel, Lager- oder Bestellfixtures zur Prüfung verändert. Praktische Inhaberabnahme weiterhin später.

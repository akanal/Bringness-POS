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
- Native PostgreSQL-Prüfung erfolgt zusätzlich in den bestehenden CI-/Deployment-Pflichtläufen; lokal kein PostgreSQL-Dienst verfügbar. Praktische Restaurantabnahme bleibt verschoben; synthetische Tests sind kein Nachweis realer Prognosegüte.

Code-Upload, CI und tatsächliche Livebereitstellung werden separat nachgewiesen. Deployment-Anforderung ausschließlich target ai über den bestehenden Sicherungs-/Rückfallweg.

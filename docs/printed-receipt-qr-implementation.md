# Gedruckter Beleg: individueller QR-Code

## Umsetzung
- Bestehenden `receipts.public_token` und GET `/beleg/:token` verwenden; niemals interne Beleg-ID oder fortlaufende Nummer als öffentlichen Zugriffsschlüssel verwenden.
- Beim Checkout für jeden Beleg einen kryptografisch zufälligen, eindeutigen Token erzeugen und persistent speichern. Bereits bestehende Token nicht bei Nachdruck wechseln.
- Druckvorlage für 58/80-mm-Thermobons um mittig ausgerichteten QR-Code ergänzen. Inhalt: absolute HTTPS-URL aus der konfigurierten öffentlichen POS-Origin plus `/beleg/` plus Token. Keine lokale oder interne URL.
- Beschriftung: „Scannen und Beleg digital öffnen“. QR ausreichend groß, mit Ruhezone, hohem Kontrast und druckertauglicher Auflösung.
- Öffentliche Belegseite enthält Belegnummer, Positionen, Beträge, Steuern und bei `signed` TSE-Snapshot. Keine zusätzlichen Kundendaten ohne rechtliche Grundlage offenlegen.
- Fehlerzustand: Ist Token oder öffentliche HTTPS-Origin nicht vorhanden, keinen falschen QR-Code drucken; Fehler protokollieren und Belegausgabe gemäß POS-Prozess ermöglichen.

## Tests vor Freigabe
1. Gedruckter QR öffnet auf Android/iOS exakt den betreffenden Beleg; mehrere Belege und Nachdrucke prüfen.
2. QR auf 58- und 80-mm-Druckern scannen, einschließlich schwacher Druckqualität.
3. Manipulierte und unbekannte Tokens ergeben 404; Token wird nicht in Logs/Analytics preisgegeben; Zugriffsmodell und Aufbewahrung prüfen.
4. Belegnummer, Gesamtsumme, Steuern und TSE-Daten gegen Datenbank-Snapshot abgleichen.
5. Offline-Verhalten und nachträgliche Synchronisierung testen; keine interne Hostadresse in QR übernehmen.
6. Regressionstests für Checkout, Druck und öffentliche Belegroute durchführen.

## Status
Technische Vorgabe; noch keine Implementierung der Druckvorlage und keine bestandene Scan-Abnahme. Live-Kasse unverändert.

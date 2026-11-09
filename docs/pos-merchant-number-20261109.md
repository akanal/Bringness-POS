# POS-Händlernummer — 9. November 2026

Beauftragt: Beim Speichern eines Händlers in der POS-Händleroption vergibt Bringness zentral eine feste Nummer; Benutzer können sie weder vorgeben noch ändern. Neue Händlerrechnungen zeigen „Händlernummer“ fett im rechten oberen Metadatenbereich.

- Globale Datenbanksequenz ausschließlich für als Händler gespeicherte Empfänger, eindeutiger Index und Änderungsschutz. Normale Kundeneinträge bleiben ohne Nummer. Bestehende gewöhnliche Einträge werden erst durch ausdrückliches Speichern in der Händleroption als Händler nummeriert; keine pauschale Umdeutung historischer Kunden.
- Anlagekennung mit serverseitigem Fingerprint und Transaktionssperre verhindert doppelte Händler bei identischer Wiederholung. Die Oberfläche bewahrt die ursprüngliche Anlageanfrage für Wiederholung nach Verbindungsabbruch/Neuladen.
- Kasse sendet die gespeicherte Händler-ID. Der Server liest die zugehörige Nummer ausschließlich innerhalb desselben Betriebs und speichert sie im Rechnungsempfänger-Snapshot. Vom Browser gelieferte Nummern werden verworfen. Gespeicherte Rechnungen werden nicht nachträglich nummeriert oder verändert. Frühere Checkout-Anfragen ohne Händler-ID bleiben für Kompatibilität und Wiederherstellung unterstützt; die aktualisierte Händleroberfläche verlangt einen gespeicherten Händler vor einer neuen Zahlung.
- Nur Händlerverwaltung, zugehörige Rechnungsvorschau und Händler-PDF geändert. Keine Markt-/AI-/Kellner-/Zahlungsanbieter- oder Bereitstellungskonfiguration geändert.

Lokale Prüfung: 705 allgemeine Tests; bestehender HTTP-Gesamtablauf mit PGlite einschließlich normalem Kunden ohne Nummer, Händleranlage/Replay/Konflikt, unveränderlicher Nummer, Migration, gefälschter Nummer, unbekanntem Händler und gespeichertem PDF; Händler- und Kunden-DOM-Prüfungen einschließlich Wiederherstellung nach Neuladen; PDF-Text/Position und gerenderte A4-Seite visuell geprüft. Zusätzlicher Paralleltest wird im bestehenden PostgreSQL-CI-Lauf ausgeführt.

CI, Zusammenführung, Bereitstellung und Live-Abgleich werden separat anhand tatsächlicher Ergebnisse vermerkt. Keine produktiven Testhändler oder Verkäufe zur Prüfung anlegen.

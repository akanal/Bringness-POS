# POS-Händlernummer — 9. November 2026

Beauftragt: Beim Speichern eines Händlers in der POS-Händleroption vergibt Bringness zentral eine feste Nummer; Benutzer können sie weder vorgeben noch ändern. Neue Händlerrechnungen zeigen „Händlernummer“ fett im rechten oberen Metadatenbereich.

- Globale Datenbanksequenz ausschließlich für als Händler gespeicherte Empfänger, eindeutiger Index und Änderungsschutz. Normale Kundeneinträge bleiben ohne Nummer. Bestehende gewöhnliche Einträge werden erst durch ausdrückliches Speichern in der Händleroption als Händler nummeriert; keine pauschale Umdeutung historischer Kunden.
- Anlagekennung mit serverseitigem Fingerprint und Transaktionssperre verhindert doppelte Händler bei identischer Wiederholung. Die Oberfläche bewahrt die ursprüngliche Anlageanfrage für Wiederholung nach Verbindungsabbruch/Neuladen.
- Kasse sendet die gespeicherte Händler-ID. Der Server liest die zugehörige Nummer ausschließlich innerhalb desselben Betriebs und speichert sie im Rechnungsempfänger-Snapshot. Vom Browser gelieferte Nummern werden verworfen. Gespeicherte Rechnungen werden nicht nachträglich nummeriert oder verändert. Frühere Checkout-Anfragen ohne Händler-ID bleiben für Kompatibilität und Wiederherstellung unterstützt; die aktualisierte Händleroberfläche verlangt einen gespeicherten Händler vor einer neuen Zahlung.
- Nur Händlerverwaltung, zugehörige Rechnungsvorschau und Händler-PDF geändert. Keine Markt-/AI-/Kellner-/Zahlungsanbieter- oder Bereitstellungskonfiguration geändert.

Lokale Prüfung: 705 allgemeine Tests; bestehender HTTP-Gesamtablauf mit PGlite einschließlich normalem Kunden ohne Nummer, Händleranlage/Replay/Konflikt, unveränderlicher Nummer, Migration, gefälschter Nummer, unbekanntem Händler und gespeichertem PDF; Händler- und Kunden-DOM-Prüfungen einschließlich Wiederherstellung nach Neuladen; PDF-Text/Position und gerenderte A4-Seite visuell geprüft. Zusätzlicher Paralleltest wird im bestehenden PostgreSQL-CI-Lauf ausgeführt.

## Verifizierte Veröffentlichung

- PR #283 zusammengeführt als `ec9c38e72ca53f378d986500b5c32517752ef637`; geprüfter Anwendungs-/Teststand `4f181eddf4507ca267e964650b3d5ca752b87ce3`, Quellbaum `d2f89b881f0f089410bf5e0f9ba3a85659796937` identisch zum lokalen Stand.
- Finale POS/AI-Integration einschließlich Händler-Paralleltest auf PostgreSQL: Run `42679825498`, Job `129371039892`, erfolgreich. Bringness checks `42679825501`, POS release `42679825496`, Farben/Navigation `42679825052` und isolierte Vorschau `42679825111` erfolgreich.
- Chromium und WebKit der identischen Anwendungsfassung bestanden zunächst Run `42679513327`; der folgende Commit änderte ausschließlich zwei isolierte DOM-Testaufbauten. Abschließender Merge-Browserlauf `42680825610` besteht beide Engines (Jobs `129374559961`, `129374559962`). Merge-Integration `42680825327`/`129374551045` ebenfalls erfolgreich.
- Netcup `42680825308`, Job `129374551197`, meldet exakt `ec9c38e72ca53f378d986500b5c32517752ef637` bereitgestellt. Vorheriger Container und Datenbanksicherung behalten.
- Live `/health`: HTTP 200, `status:ok`. Beide geänderten Skripte HTTP 200/no-store/bytegleich zum geprüften Stand. POS-HTML verweist auf `merchant-number-20261109` und entspricht exakt der geprüften Vorlage einschließlich vorhandener serverseitiger Helper-Ergänzungen.
- Keine produktiven Testhändler oder Verkäufe angelegt. Produktionsdatenbank wurde nicht separat nach persönlichen Händlerdaten abgefragt; das Verhalten ist in isolierten HTTP-/Datenbank-/DOM-/PDF-Prüfungen verifiziert.

# Vorbereitung mit Bestandsabgleich

19.11.2026. Aufbau auf den vorhandenen Vorbereitungsmengen und optionalen Tageszeitfenstern. Unter Lager & Küche erscheinen je Planungstag gemeinsame Zutatenmengen aus allen Gerichten, verfügbarer Bestand inklusive datierter bestätigter Lieferungen, zusätzliche Fehlmenge und rechnerischer Rest.

Reservierte Mengen sind abgezogen. Ein Bestand wird über den Planungshorizont nur einmal verbraucht; Fehlmengen erzeugen keinen fiktiven Nachschub. Lieferungen gelten frühestens ab ihrem Datum, überfällige, nicht angenommene, stornierte, bereits erhaltene, nicht lieferbare oder mit offenem Ersatzvorschlag versehene Aufträge zählen nicht. Konto und Standort bleiben getrennt. Bestands-/Lieferabfragen nach der Prognose laufen in einer gemeinsamen lesenden Repeatable-Read-Transaktion, damit gleichzeitig bestätigter Wareneingang nicht doppelt zählt. Ein geänderter Einstellungstand verwirft beide Empfehlungen.

Die Mengen gelten für ganze Kalendertage, nicht für den verbleibenden Bedarf ab Abruf. Ein Lieferdatum bestätigt keine Lieferuhrzeit vor Frühstück/Mittag. Bestand bedeutet keine Freigabe der Haltbarkeit oder Verwendbarkeit. Fehlende Prognosetage blockieren weitere Deckungsberechnungen, bekannte Ruhetage verbrauchen nichts. Unbekannte Bestandsdaten bleiben unbekannt. Rechenschritte erfolgen in Tausendsteln der jeweiligen Lagereinheit.

Keine Lagerbuchung, Reservierung, Einkaufsübernahme oder Bestellung; die bestehenden Einkaufs- und Automatikfreigaben werden nicht verändert. Die Übernahme solcher Fehlmengen in den Beschaffungsweg ist ein nachfolgender Entwicklungsblock. Windows/Offline bleiben außerhalb dieses Blocks.

## Prüfung

780 allgemeine Node-Tests bestanden; neue Kernfälle für gemeinsame Zutaten, Reservierungen, mehrtägige Einmalanrechnung, Liefertermine, fehlende Daten, Ruhetage und Dezimalmengen. Isolierte PGlite-Integration prüft reale SQL-Filter für Status, fremde Käufer, Lieferdaten und offene Ersatzvorschläge sowie unveränderten Lagerbestand und Einstellungswechsel. Vollständige AI-HTTP-/DOM-Integration bestanden. PostgreSQL-CI und tatsächliche Veröffentlichung separat nachzuweisen; praktische Inhaberabnahme weiter verschoben.

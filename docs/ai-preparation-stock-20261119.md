# Vorbereitung mit Bestandsabgleich

19.11.2026. Aufbau auf den vorhandenen Vorbereitungsmengen und optionalen Tageszeitfenstern. Unter Lager & Küche erscheinen je Planungstag gemeinsame Zutatenmengen aus allen Gerichten, verfügbarer Bestand inklusive datierter bestätigter Lieferungen, zusätzliche Fehlmenge und rechnerischer Rest.

Reservierte Mengen sind abgezogen. Ein Bestand wird über den Planungshorizont nur einmal verbraucht; Fehlmengen erzeugen keinen fiktiven Nachschub. Lieferungen gelten frühestens ab ihrem Datum, überfällige, nicht angenommene, stornierte, bereits erhaltene, nicht lieferbare oder mit offenem Ersatzvorschlag versehene Aufträge zählen nicht. Konto und Standort bleiben getrennt. Bestands-/Lieferabfragen nach der Prognose laufen in einer gemeinsamen lesenden Repeatable-Read-Transaktion, damit gleichzeitig bestätigter Wareneingang nicht doppelt zählt. Ein geänderter Einstellungstand verwirft beide Empfehlungen.

Die Mengen gelten für ganze Kalendertage, nicht für den verbleibenden Bedarf ab Abruf. Ein Lieferdatum bestätigt keine Lieferuhrzeit vor Frühstück/Mittag. Bestand bedeutet keine Freigabe der Haltbarkeit oder Verwendbarkeit. Fehlende Prognosetage blockieren weitere Deckungsberechnungen, bekannte Ruhetage verbrauchen nichts. Unbekannte Bestandsdaten bleiben unbekannt. Rechenschritte erfolgen in Tausendsteln der jeweiligen Lagereinheit.

Keine Lagerbuchung, Reservierung, Einkaufsübernahme oder Bestellung; die bestehenden Einkaufs- und Automatikfreigaben werden nicht verändert. Die Übernahme solcher Fehlmengen in den Beschaffungsweg ist ein nachfolgender Entwicklungsblock. Windows/Offline bleiben außerhalb dieses Blocks.

## Prüfung

780 allgemeine Node-Tests bestanden; neue Kernfälle für gemeinsame Zutaten, Reservierungen, mehrtägige Einmalanrechnung, Liefertermine, fehlende Daten, Ruhetage und Dezimalmengen. Isolierte PGlite-Integration prüft reale SQL-Filter für Status, fremde Käufer, Lieferdaten und offene Ersatzvorschläge sowie unveränderten Lagerbestand und Einstellungswechsel. Vollständige AI-HTTP-/DOM-Integration bestanden. PostgreSQL-CI und tatsächliche Veröffentlichung separat nachzuweisen; praktische Inhaberabnahme weiter verschoben.

## Verifiziert veröffentlicht

PR359, geprüfter Feature-Commit4388462db6c632bb415689dba130808b8c9dd76a und Quellbaum78285add20a393401e74992abdb554d04bf76335. Alle fünf PR-Prüfungen erfolgreich: Bringness44540708806, POS release44540708664, isolierter tatsächlicher Stack44540708921, Center Chromium/WebKit44540708815 und POS/AI44540708913/job135617952492. Letzterer bestätigt die erweiterte learning-assistant-Prüfung auf PostgreSQL16 und vollständige AI-HTTP-/DOM-Integration.

Merge28adf872b838cfc79fdec65dcf48d91c9e142391 enthält exakt denselben Quellbaum. Netcup44541503561/job135620752047 erfolgreich: authentifiziertes Log19.11.2026 14:16:59UTC bestätigt ausschließlich target ai und exakt diese Revision; vorheriger Container und Datenbanksicherung erhalten. Erneute PostgreSQL-/AI-Prüfung im Deployment erfolgreich.

Live /ai-workspace.html und /ai-workspace.js jeweils200 und bytegleich zur geprüften Quelle. SHA256 HTML5a00cad0de70f7c9b88a1faf6d8f8cdfd876e6c229c911566b6f6c328ee70d07, JS9bea8d7c43ace21d14ef7723e456f4dd08d6834a0ca54dd30ac8b37ad4343626. Live /health200/status:ok/database:ok; Küchen-API ohne Sitzung401. Keine produktiven Testkonten, Lagerbuchungen, Lieferungen oder Bestellungen erzeugt. Praktische Inhaberabnahme und Übernahme der Fehlmengen in die Beschaffung bleiben nächste getrennte Schritte.

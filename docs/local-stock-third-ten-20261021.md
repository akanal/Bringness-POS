# Drittes lokales Zehnerpaket – 21.10.2026

Basis: 88f4154. Zweig: work/stock-safety-third-ten-20261021. Zehn technische Änderungen, keine zehn neuen Produktmodule. Kein Upload und keine Bereitstellung.

1. Zutatenmengen und Portionszahlen vor Aggregation auf dezimale Lagerpräzision begrenzen.
2. Eingänge, offene Beschaffung und Bestandsziele gegen dieselben Mengengrenzen prüfen.
3. Negative physische Bestände erhalten; ungültige Schreibweisen und übergenaue Werte zurückweisen.
4. Beschaffungsziele unter Mindestbestand zurückweisen.
5. Fehlmengen in ganzzahligen Tausendsteleinheiten berechnen, damit Rundungsreste keine zusätzliche Beschaffung auslösen.
6. Statuszuordnung gegen geerbte Objektschlüssel wie constructor absichern.
7. Stornogründe ohne Objekt-/Boolean-Konvertierung prüfen und für alle Aktionen begrenzen.
8. Firmenzuordnung des Betriebs während POS-Lagerverarbeitung mit einer geteilten Zeilensperre halten.
9. Aktive Inhaberfreigabe beim Schreiben der AI-Verfügbarkeit erneut prüfen.
10. Offline-Firmen-/Betriebszuordnung nach Sperren des Verkaufs neu lesen statt vorausgewählte Metadaten zu übernehmen.

## Verifikation

- npm test: 553 bestanden, null Fehler. Enthält zehn neue gezielte Regressionstests.
- stock-lifecycle.mjs: 36 Szenarien bestanden (PGlite/JSDOM).
- pos-stock-bridge.mjs: 37 Szenarien bestanden (getrennte eingebettete PostgreSQL-Engines).
- Syntaxprüfungen und git diff --check bestanden.
- Der bestehende Offline-Zeitstempeltest wurde um die neue Metadatenabfrage ergänzt; ursprünglicher Zeitstempel, stabile Ereigniskennung und identische Wiederholung bleiben geprüft.

Der frühere externe Paralleltest wird nicht als Prüfung dieser neuen Änderungen ausgegeben. Echte parallele PostgreSQL-Verbindungen für die neue Betriebssperre sowie Geräte-/Netzabbruchabnahme sind noch ausstehend. Keine Freigabe zur Live-Veröffentlichung abgeleitet.

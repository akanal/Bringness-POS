# Viertes lokales Zehnerpaket – 21.10.2026

Basis: c664d97. Zweig: work/stock-validation-fourth-ten-20261021.
Zehn technische Absicherungen, keine neuen Produktmodule. Kein Upload, keine Bereitstellung.

1. Geerbte Status- und Aktionsnamen bei Küchenstatuswechseln zurückweisen.
2. Lagerauftragskörper vor Datenbankzugriff als Objekt prüfen.
3. UUIDs ausschließlich als Zeichenketten annehmen.
4. Begründungen ohne implizite Objekt-, Zahlen- oder Boolean-Konvertierung prüfen.
5. Annahmepositionen vor Normalisierung auf 1–100 begrenzen.
6. Fehlerhafte Annahmepositionen vor Datenbankzugriff zurückweisen.
7. Nullportionen vor Datenbankzugriff zurückweisen.
8. Rückbuchungen vor Normalisierung auf 1–100 Positionen begrenzen.
9. Fehlerhafte Rückbuchungspositionen vor Datenbankzugriff zurückweisen.
10. Doppelte Zutaten und Nullmengen vor Rückbuchungstransaktionen zurückweisen.

## Verifikation

- npm test: 563 bestanden, null Fehler; zehn neue Regressionstests.
- stock-lifecycle.mjs: 36 Szenarien bestanden (PGlite/JSDOM).
- pos-stock-bridge.mjs: 37 Szenarien bestanden (getrennte eingebettete PostgreSQL-Engines).
- Syntaxprüfung der geänderten Produktionsdateien und git diff --check bestanden.
- Lokale bereits vorhandene Abhängigkeiten wiederverwendet; keine Abhängigkeitsdateien geändert.
- Echte parallele PostgreSQL-Verbindungen für die Betriebssperre aus dem vorigen Paket und praktische Geräte-/Netzabbruchabnahme bleiben offen. Eingebettete Datenbankszenarien ersetzen diese Prüfung nicht.
- Keine Änderung der Kassenoberfläche, kein GitHub-Upload, keine Live-Änderung.

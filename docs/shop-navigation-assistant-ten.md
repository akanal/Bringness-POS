# Shop-Navigation und Assistent: Zehnerblock

1. Der beanstandete Footerlink Zur Kasse öffnet den vorhandenen Warenkorb im Shop statt /pos/.
2. Allgemeine Kontoverweise im Shop und in der Bestellhistorie führen zur Shop-Anmeldung. Der ausdrücklich bezeichnete Online-Kasse-Link in bestehenden Lizenzen bleibt für diesen eigenen Zweck erhalten.
3. Auch die Rückkehr vom Zahlungsanbieter und ihr Hinweis führen zur Shop-Anmeldung statt zur POS-Anwendung.
4. Warenkorb, Merkliste und Vergleich reagieren auf Fragmentwechsel innerhalb derselben Seite und auf Browser-Zurück/Vorwärts ohne Serveraktion.
5. Assistententhemen erhalten eigene Fragmentnavigation und reagieren auf Zurück/Vorwärts.
6. Beispielfragen für Konto, Angebote und Kaufhilfe füllen nur das Fragefeld. Es wird nichts automatisch übermittelt.
7. KI-Verfügbarkeit lässt sich nach einer Konfiguration ausdrücklich erneut prüfen. Die Antwort muss zum erwarteten eingeschränkten Statusformat passen.
8. Offline-Zustand sperrt neue KI-Anfragen. Wiederverbindung startet keine automatische Anfrage. Textkopieren erfolgt nur per eigenem Klick mit verständlicher Rückmeldung bei fehlender Browserfreigabe.
9. Vor Übernahme eines Angebotsvorschlags zeigt der Editor den vollständigen Text. Bestehende Titel/Beschreibung werden nur nach Bestätigung ersetzt; Preis, Steuer, Bestand und Kontobindung bleiben erhalten.
10. Eine interaktive Konfigurationshilfe für die vorhandene Netcup-Konsole speichert den API-Schlüssel ohne Echo, Kommandoargumente oder Logs in der bestehenden geschützten Umgebungsdatei. Sie prüft Rechte, Pfade, Dateityp, konkurrierende Änderungen und Eingabeformat; andere Einstellungen werden erhalten und privat gesichert. Details in shop-assistant-setup.md. Keine Erweiterung des eingeschränkten SSH-Zugangs.

Gezielte DOM-Prüfungen und die bestehende echte PostgreSQL-/Chromium-Akzeptanz prüfen Navigation und Textübernahme. Konfigurationsprüfungen verwenden ausschließlich temporäre Dateien und synthetische Geheimnisse. Es gibt keine echten Anbieteraufrufe, Zahlungen oder neuen Produktionsdatensätze für diese Veröffentlichung.

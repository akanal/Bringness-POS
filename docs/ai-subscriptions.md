# Bringness AI Monatsabos

Tarife: AI Premium 49 EUR netto je Restaurantstandort/Monat, Lieferanten-Basis 59 EUR und Profi 99 EUR netto je Konto/Monat. Lieferantenprovisionen bleiben zusätzlich 2 % des vermittelten Netto-Warenwerts. Tarifverwaltung kann neue Angebote ändern; bereits angenommene Vereinbarungen behalten ihren Preis bis zum ausdrücklich bestätigten Tarifwechsel.

Bestehende kostenlose Konten werden nicht automatisch zu zahlenden Abos. Unter „Abos & Testphase“ bestätigt der Kontoinhaber Tarif, Preisversion und wiederkehrende Gebühren. Restaurantstandorte erhalten einmalig 30 Testtage; Kündigung oder erneute Anmeldung setzt diese Frist nicht zurück. Lieferantentarife haben keine zusätzliche Testphase. Kündigung während Testphase oder wartender Einrichtung wirkt sofort, bei laufendem Abo zum Periodenende. Tarifwechsel wirkt ab der nächsten Periode.

Die Zahlungsautomatik bleibt ohne geprüften Rechnungssteller, Steuerregelung, SMTP, Live-Zahlungsanbieter, bestätigtes Rechnungsprofil und gültiges geprüftes SEPA-Mandat gesperrt. Der Superadmin aktiviert automatische Rechnungen und Monatsabos gesondert unter Zahlungsautomatik. Ein gespeicherter Zustimmungshaken ersetzt kein Bankmandat. Anbieterreferenzen müssen tatsächlich beim Anbieter vorhanden sein und zum aktiven Konto passen.

Der bestehende Worker erstellt eindeutige, unveränderliche Monatspositionen und Rechnungen, kündigt den Einzug an und wartet die Vorankündigungsfrist ab. Zahlungsabgleich nutzt den Anbieterstatus und prüft Betrag, Währung, Kunde und Zuordnung. Fehlgeschlagene oder unklare Einzüge werden nicht automatisch erneut gesendet. Offene Vorperioden blockieren weitere Monatspositionen. Rücklastschriften werden als Ausnahme sichtbar.

Bei fehlender Einrichtung nach Testende entstehen keine Gebühren für die Wartezeit. Ein verspäteter Wiederbeginn über 24 Stunden startet einen neuen Zeitraum ohne Rückberechnung der Unterbrechung. Monatsenden werden vom ursprünglichen Starttag berechnet (31. Januar → 28./29. Februar → 31. März). Bereits ausgestellte Rechnungen und übermittelte Bankeinzüge werden durch Kündigung nicht rückwirkend aufgehoben.

Prüfung: `node server/ai-tests/integration.mjs` verwendet eingebettetes PostgreSQL und simulierte Zahlungsschnittstellen. Reale Zahlungen oder E-Mails sind keine Voraussetzung dieser Tests. Ein echter Bankeinzug ist erst nach vollständiger Anbieter- und Rechnungsstellereinrichtung prüfbar.

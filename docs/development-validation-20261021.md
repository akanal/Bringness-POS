# Bringness POS / AI: Entwicklungsprüfung vom 21.10.2026

Geprüfter Code: PR112 (24-Stunden-Eingaben/Anzeigen) plus PR113 (Offline-Wiederanlauf). Code- und Regressionsteststand: `88c32b17d684f436769517b54ad917f9b341f70e`. Ausschließlich lokale/isolierte Testdaten; kein Produktivverkauf, keine echte Zahlung, Beschaffung oder Mailzustellung. Noch keine Live-Veröffentlichung dieser Entwürfe.

## Ergebnis, Ursache und nächster Schritt

| Prüfung | Ergebnis | Ursache / Nachweisgrenze | Nächster Fix oder Schritt |
| --- | --- | --- | --- |
| POS-/AI-Basis | Bestanden: 536 Tests | Root-Suite, keine Fehler oder übersprungenen Tests | Kein Fix aus diesem Lauf |
| Desktop-Ledger, Gerätefreigabe, Synchronisierung | Bestanden: 39 Tests | Einschließlich zwei neuer Lebenszyklus-/Fristfälle mit echter lokaler PostgreSQL-Engine | Windows-/Kundengerät separat abnehmen |
| Windows-Workflow-Grenzen | Bestanden: 4 Tests | Staging-Testbuild darf keinen öffentlichen Installer ersetzen | Signaturzertifikat weiterhin zurückgestellt |
| Originalpreise nach Katalogwechsel / abgelaufener ursprünglicher Katalog | Bestanden | Bereits gespeicherter Verkauf bleibt bei Wiederholung identisch; neuer Verkauf mit abgelaufenem Katalog abgewiesen | Kein Fix aus diesem Lauf |
| Firmen-/Gerätetrennung | Bestanden | Fremder Verlauf, Zähler, Export und Verkaufswiederholung gesperrt; legitimer Wechsel zurück erhält Originalbeleg | Praktischen Firmenwechsel am Gerät prüfen |
| Offline-Wiederherstellung in der Oberfläche | Bestanden | Tatsächliches DOM, Preload-Vertrag und Ledger; Originalpreis nach Hintergrund-Katalogwechsel, keine zweite Buchung | Tatsächliches Windows-Neustart-/Netzausfallszenario offen |
| Verspätete Antwort / alte Warenkorb- und Druckanzeige | Bestanden | Neuere Firmenansicht gewinnt; alte Anzeige wird geleert, gespeicherte Verkäufe bleiben erhalten | Kein Fix aus diesem Lauf |
| Kurze Katalogfreigabe | Bestanden | Erneuter Serverabruf vor Sechs-Stunden-Intervall; unverändert abgelaufene Serverantwort bleibt Warnung | Reale Geräte-/Lizenzverlängerung prüfen |
| Offline-HTTP-Abbruch und erneute Anmeldung | Bestanden | Authentifizierte echte HTTP-Route, Socketverlust vor/nach Commit, Dateisystemneustart, 401/403 und genau zwei Cloudbelege | Internet-/Netcup-/Kundengerät-Abnahme offen |
| Steuerberater und Offline-Bestände | Bestanden | Kontentrennung, Bestandsschutz, 251-Beleg-Seitennavigation; getrennte CSV-/JSON-Oberflächenprüfung | Praktische Freigabe und Entzug mit zwei Konten |
| 24-Stunden-Werbeformular / Zeitumstellung | Bestanden | Echte Formularverarbeitung: ungültige Eingaben ohne Schreibaufruf, Sommerzeit-Lücke, Herbst-Doppelstunde erhält UTC/Sekunden, bewusste Zeitänderung, Mitternachtsübergang | Andere Geräte-/Browsergebiete gemäß T02 |
| AI-Planung, DWD-/PLZ-Zuordnung, Warenfluss, Prognose/Beschaffung | Bestanden | Vollständige isolierte AI-Integration; Anbieter-/Mailaufrufe im Test simuliert | Keine produktive Beschaffung aus diesem Nachweis ableiten |
| Personal und Dienstplan | Bestanden | Zwei eigenständige Datenbank-/DOM-Prüfläufe zusätzlich zu Servicefällen unten | Praktische Uhrzeit-/PIN-Abnahme offen |
| POS-/Händler-/Pfand-/Admin-/Service-Flows | Bestanden: 27 zusätzliche Prüfläufe | Einzelne Skripte unten; keine echte Terminal-, Scanner- oder Druckerprüfung | Physische Abläufe gemäß gemeinsamer Testliste |
| Gerätefehlermeldung im ersten Desktopdurchlauf | Zunächst fehlgeschlagen, korrigiert und erneut bestanden | Neue kombinierte Firmen-/Gerätemeldung passte nicht zur bestehenden Gerätefehlermeldung; beide Fälle jetzt getrennt verständlich | Kein offener Fix; 39 Desktopfälle danach bestanden |
| Neuer DOM-Test wartete vor Ende des ersten Ladevorgangs | Testaufbau zunächst fehlgeschlagen, korrigiert und erneut bestanden | Initialer HTML-Button war bereits aktiviert; Test wartet jetzt zusätzlich auf den geladenen Warenkorb | Kein Produktfehler daraus abgeleitet |

Damit sind lokal 579 Einzeltests aus drei Suites sowie 35 eigenständige Integrations-/DOM-Prüfläufe bestanden. Diese Zahlen sind unterschiedliche Zählweisen und werden nicht zu einer angeblichen Zahl von Funktionstests addiert.

## Die 27 ergänzenden Prüfläufe

- `server/ai-tests/checkout-ui.mjs`: bestanden.
- `server/ai-tests/checkout-recovery.mjs`: bestanden.
- `server/ai-tests/settlement-ui.mjs`: bestanden.
- `server/ai-tests/table-settlement.mjs`: bestanden.
- `server/ai-tests/cash-closing.mjs`: bestanden.
- `server/ai-tests/cash-closing-ui.mjs`: bestanden.
- `server/ai-tests/trade.mjs`: bestanden.
- `server/ai-tests/trade-ui.mjs`: bestanden.
- `server/ai-tests/trade-toggle-ui.mjs`: bestanden.
- `server/ai-tests/customer-delivery.mjs`: bestanden.
- `server/ai-tests/customer-delivery-ui.mjs`: bestanden.
- `server/ai-tests/deposit-flow.mjs`: bestanden.
- `server/ai-tests/deposit-ui.mjs`: bestanden.
- `server/ai-tests/deposit-journal-ui.mjs`: bestanden.
- `server/ai-tests/remote-support.mjs`: bestanden.
- `server/ai-tests/admin-audit.mjs`: bestanden.
- `server/ai-tests/pos-auth.mjs`: bestanden.
- `server/ai-tests/admin-reset-integration.mjs`: bestanden.
- `server/ai-tests/transactional-mail.mjs`: bestanden.
- `server/ai-tests/personnel-service.mjs`: bestanden.
- `server/ai-tests/staff-lifecycle.mjs`: bestanden.
- `server/ai-tests/table-waiters.mjs`: bestanden.
- `server/ai-tests/waiter-workflow.mjs`: bestanden.
- `server/ai-tests/waiter-draft.mjs`: bestanden.
- `server/ai-tests/waiter-push.mjs`: bestanden.
- `server/ai-tests/waiter-signal.mjs`: bestanden.
- `server/ai-tests/displays.mjs`: bestanden.

Die weiteren acht Prüfläufe sind `integration.mjs`, `offline-ui.mjs`, `offline-http-sync.mjs`, `offline-accountant.mjs`, `accountant-ui.mjs`, `personnel.mjs`, `duty-planning.mjs` und `time24-forms.mjs`.

## GitHub-Prüfungen auf demselben Code

- [POS/AI mit PostgreSQL 16](https://github.com/akanal/Bringness-POS/actions/runs/39629406909): bestanden, einschließlich echter PostgreSQL-Konkurrenzprüfungen, Freigabeentzug, Zahlungswiederholungen, Steuerberater-Pagination, Offline-HTTP und der vollständigen AI-/Personal-/Gast-/Fiskal-Testabläufe.
- [Windows Electron mit echtem lokalem HTTP-Handler](https://github.com/akanal/Bringness-POS/actions/runs/39629406608): bestanden, einschließlich echter Electron-Laufzeit, IPC, Dateisystemneustart und HTTP-Verbindungsabbrüchen.
- [Isolierter tatsächlicher POS-/AI-Stack und Rücksicherung](https://github.com/akanal/Bringness-POS/actions/runs/39629406905): bestanden, einschließlich Browseroberflächen, Egress-Sperre sowie verschlüsselter Sicherung und unabhängiger Rücksicherung.
- [Windows-Testbuild](https://github.com/akanal/Bringness-POS/actions/runs/39629406649): bestanden, einschließlich nativer Offline-/Fernhilfe-Prüfung und Installer-Build. Keine signierte öffentliche Installerfreigabe daraus ableiten.

## Verbleibende Grenzen

Die praktische Liste steht weiterhin einmalig in `test-backlog.md`: tatsächliches Kundengerät mit Neustart und Netzausfall, Scanner, Drucker, Handy-/Safari-/Push-Abnahme, zweites Gerät für Fernhilfe, echte Mailzustellung und betrieblicher Ablauf. Produktive TSE und Windows-Signatur bleiben extern zurückgestellt. Keine neue kostenpflichtige Freigabe oder Vertragsbestellung wurde ausgelöst. Der blockierte sichere Cloud-Browser wurde nicht umgangen.

Alle vier oben verlinkten GitHub-Prüfläufe auf dem Codecheckpoint sind erfolgreich abgeschlossen. Der nachfolgende Berichtscommit ändert nur Dokumentation und keine ausgeführte Anwendungslogik.

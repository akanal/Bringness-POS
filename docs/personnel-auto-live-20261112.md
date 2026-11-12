# Personalergänzungen – verifiziert live am 12.11.2026

- Auftrag: bestehende Kellner-App weiterverwenden; Krankmeldung zurücknehmen mit klarer Inhabermeldung; automatische Planung/neue Mitarbeiter; dauerhafter Vorrang für Inhabervorgaben; geprüfte Livebereitstellung ausdrücklich autorisiert.
- PR: https://github.com/akanal/Bringness-POS/pull/303
- Ausgelieferte Anwendungsrevision: `7d37e9ae5b208450758ff75e8fa62e8c05c4855c`.
- Netcup operations: Run `43273814471`, Job `131376790703`, erfolgreich. Authentifiziertes Serverprotokoll bestätigt exakt diese Revision, vorherigen Container und Datenbanksicherung behalten.

## Umsetzung

Eigene aktive Krankmeldungen können als irrtümlich zurückgenommen werden, getrennt vom Gesundmelden. Die Abwesenheit bleibt als `cancelled` erhalten. Priorisierte Inhabermeldung mit eindeutiger Beschriftung und transaktionale E-Mail; identische Wiederholung ohne doppelte Meldung.

Die bestehende roster-auto-Planung erhält `automaticPublication` und `autoEnroll` als explizite Betriebsoptionen. Vorhandener Freigabemodus bleibt erhalten. Es werden keine Besetzungszeiten oder Qualifikationen geraten und keine bestehenden Betriebe global umgestellt. Neue aktive Mitarbeiter ohne individuelles Profil gelten bei aktivierter Aufnahme an den ausdrücklich angezeigten Besetzungstagen ganztägig als verfügbar; eigene Verfügbarkeiten/Ausschlüsse haben Vorrang. Nur aktivieren, wenn diese Standardverfügbarkeit den vereinbarten Einsatzzeiten entspricht.

Minütliche Prüfung der laufenden und zwei kommenden Wochen. Passende Dienste werden atomar veröffentlicht und verknüpfte aktive Mitarbeiter erhalten eine Änderungs-E-Mail mit Link zum aktuellen Plan in der vorhandenen App. Unbesetzte oder widersprüchliche Dienste bleiben als offener Vorschlag sichtbar, ohne passende Einteilungen zu blockieren. Bereits veröffentlichte/manuelle Dienste und feste Wochenregeln werden bewahrt. Es entstehen keine Arbeitszeitstempel durch Planung.

## Verifikation

- 714 allgemeine Tests ohne Fehler/Skip; 14 fokussierte Kern-/Personalauswertungstests.
- API/PGlite: Rücknahme, eigener Bereich, Wiederholung ohne doppelte Meldung, automatische Aufnahme, Benachrichtigungen, Teilbesetzung/offene Stellen und wiederholter Worker ohne doppelte Dienste.
- Roster-, Standby-, Personal- und Service-Team-UI-/Integrationsregressionen bestanden.
- Alle sieben PR-Workflows erfolgreich, darunter PostgreSQL-16-Dienstplanprüfung mit konkurrierender Freigabe, Chromium/WebKit und echter Produktionsstart mit Datenbank/Browser.
- Livehealth HTTP 200, `status:ok`, `database:ok`. Die ausgelieferten drei geänderten JS-Dateien stimmen bytegenau mit dem geprüften Quellcode überein; Planungs-HTML enthält die neue Versionskennung und entspricht der Quelle abgesehen von der unveränderten allgemeinen `/brand-logo.js`-Injektion.
- Kein reales Personal, kein echter Dienst und keine Stempel-/Verkaufsbuchung für die Abnahme angelegt. Reale Handyweckfunktion bei geschlossener App wurde nicht neu implementiert; bisherige Vordergrund-/Kalenderlösung bleibt bestehen.

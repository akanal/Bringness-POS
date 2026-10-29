# Zahlungsabgleich und Händlerprüfung – viertes Zehnerpaket

Basis: PR179, Remote-Head99e4f97e. Vorhandene OAuth-, Checkout-, GET-Recovery-,
Anbieterbeweis- und Test-Handoff-Funktionen bleiben die einzige Zahlungslogik.

## Umgesetzte Entwicklung

1. Bestand: Anmeldung, Rechte, gespeicherte Bestellungen, verschlüsselte Verbindung,
   Zahlungsabgleich und einmaliger Test-Handoff waren vorhanden und werden wiederverwendet.
2. Optionaler Host-Scheduler: `runtime.startReconciliation()` erst nach Migration und
   Testadapter-Konfiguration. Ein Lauf je Runtime; standardmäßig60 Sekunden Abstand
   NACH Abschluss, maximal5 Vorgänge. Kein Import-/Produktionsstart-Automatismus.
   `stop()` wartet auf laufende Arbeit; vor dem Schließen des Pools aufrufen.
3. Worker beansprucht jeden Vorgang unmittelbar vor dessen GET-Abgleich mit atomarem
   PostgreSQL SKIP LOCKED, statt sämtliche Batch-Leases vor langsamer I/O zu verbrauchen.
   Bereits bearbeitete IDs werden im selben Batch nicht erneut beansprucht.
4. Dauerhafte Diagnose: Versuche, letzter Prüfzeitpunkt, nächster Versuch und ausschließlich
   fest definierte Fehlercodes. Rückoff bis maximal3600 Sekunden; nach8 Fehlern manuelle
   Prüfung. Identitäts-/Betrags-/Zustandswidersprüche sofort aus automatischem Retry nehmen.
   Zahlungsstatus und unveränderliche Zahlungsbeweise werden dabei nicht umgeschrieben.
5. Geschützte Händlerübersicht und POST-Nachprüfung mit vorhandener frischer owner/admin-
   Authentifizierung und Händlerfreigabe. Nur eigene Bestellungen, keine Provider-IDs,
   Käuferdaten oder Secrets. Nachprüfung nutzt dieselbe dauerhafte Minuten-Sperre,
   führt ausschließlich vorhandene GET-Recovery aus und erzeugt keine zweite Zahlung.
6. Host-Vorprüfung `runtime.readiness()` meldet Migration, Testadapter und Scheduler getrennt.
   Meldet stets Testmodus, productionReady=false/canPay=false/canFulfil=false. Sie beweist
   keine tatsächliche geschützte Hostkonfiguration, Händlerzustimmung oder Providerabnahme.
7. Abnahmekriterien und ausstehende externe Schritte sind unten konkret festgehalten.
8. Abrechnungsschutz: Übersicht kennzeichnet Testzahlungen; weder tatsächliche Umsätze,
   Rechnungen, Fiskalbelege, Rückzahlungen noch eine neue Buchhaltung werden erzeugt.
   Produktive Abrechnung ist damit NICHT fertiggestellt.
9. Bestehenden einmaligen unveränderlichen Test-Handoff und Warenfreigabesperre geprüft.
   Produktive Küchen-/Versand-/Bestandsfreigabe ist NICHT implementiert oder aktiviert.
10. Server-, Scheduler-, HTTP-/UI- und bestehende Regressionen prüfen. PostgreSQL-
    Parallelabnahme um acht gleichzeitige Händler-Nachprüfungen erweitert; nativen
    Browserablauf um Händlerübersicht, Datenschutz und390/768/1280-Layouts erweitert.

## Betrieb und Grenzen

Der Scheduler wird ausdrücklich durch einen konfigurierten Testhost gestartet, nach
`await runtime.migrate()`. Nicht aus Produktions-start.js starten. Geschützte OAuth-App-
Konfiguration und stabiler Verschlüsselungsschlüssel bleiben beim Host; keine neuen
Schlüssel oder Geheimwerte im Chat. Keine Netcup-Konfiguration verändert.

Kein öffentlicher Worker-Endpunkt. `onResult` erhält nur aggregierte Zahlen oder einen
festen Fehlercode. Dauerhafte Geschäftsvorgänge liegen in PostgreSQL, nicht im Timer.
Nach Neustart werden fällige Vorgänge wiedergefunden. Einmal pro Minute ist eine Sperre,
kein Nachweis erfolgreicher Anbieterkommunikation. GET-Abgleich erzeugt nie einen POST.
Anbieterbenachrichtigungen und Kundenabgleich bleiben eigenständige geprüfte Zugänge.

Die Übersicht zeigt höchstens50 Vorgänge, manuell prüfbedürftige zuerst, dann die neuesten;
`hasMore` zeigt weitere Vorgänge an. Eine vollständige paginierte Betreiberhistorie ist
keine Behauptung dieser Übersicht. Ab24 Stunden wird ein ungelöster Vorgang markiert.
Testbestätigung ist kein Umsatz und keine Erlaubnis zur Warenübergabe.

## Konkrete Abnahme vor einer späteren Produktivfreigabe

- Geschützte Hostkonfiguration über den vorhandenen zulässigen Administrationsweg prüfen;
  OAuth-Rückkehr und Benachrichtigungsadresse müssen zum freigegebenen HTTPS-Ursprung passen.
- Echte Zustimmung des zuständigen Händlers, Organisations-/Profilzuordnung und Zugriff
  beim Anbieter prüfen. Synthetische Transportantworten ersetzen diese Abnahme nicht.
- Im freigegebenen Testhost Scheduler starten, Restarts/Fehler/Rückoff und kontrolliertes
  Stoppen beobachten; Datenbank/Timer allein beweisen keinen regelmäßigen Hostbetrieb.
- Abrechnung, Rechnungs-/Steuerbehandlung, Storno/Refund und Bestandsregeln fertigstellen
  und fachlich abnehmen. Bisherige Testtabellen niemals als produktive Umsätze übernehmen.
- Reale Übergabe benötigt einen gesonderten Live-Zahlungsbeweis und eine transaktionale,
  genau einmal ausgeführte produktive Übergabe. Test-Handoffs bleiben dauerhaft gesperrt.
- Erst danach ausdrücklich echte Zahlungen und Veröffentlichung freigeben. In diesem
  Paket wurden weder echte Händler verbunden noch Zahlungen/Deployments durchgeführt.

## Verifikation

Aktuelle bestätigte Ergebnisse werden nach Abschluss der Prüfungen ergänzt.

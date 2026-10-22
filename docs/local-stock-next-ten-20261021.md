# Nächste zehn lokale Entwicklungsblöcke

Ausgangsstand: 65efc5b mit den vorherigen elf lokal gesammelten Commits. Kein Upload und keine Live-Schaltung. Funktionstests bleiben auf Inhaberwunsch zurückgestellt. Pro Block sind Syntax und Patchformat geprüft; dies ist kein Nachweis bestandener Funktionstests.

## Automatisierte Prüfungen auf erneuten Inhaberauftrag

Am 21.10.2026 wurden die Funktionstests ausdrücklich beauftragt und lokal ausgeführt:

- `npm test`: 543 Tests bestanden, einschließlich sieben neuer gezielter Fehlersimulationen in `server/stock-recovery-regression.test.js`.
- `node server/ai-tests/stock-lifecycle.mjs`: 36 PostgreSQL-/UI-Szenarien bestanden (PGlite/JSDOM).
- `node server/ai-tests/pos-stock-bridge.mjs`: 37 Szenarien mit getrennten eingebetteten Datenbanken bestanden; verlorene Bestätigungen mit Wiederholung ohne zweiten Bestandsabzug enthalten.
- Desktop Offline-Recovery/Sync/Ledger: 30 Tests bestanden. Eine veraltete Erwartung wurde an den bereits implementierten nachgelagerten manuellen Katalogabruf angepasst; genau ein Verkaufsupload wird explizit geprüft. Kein Produktionscode hierfür geändert.
- Neue Fehlersimulationen prüfen Freigabe vor Diagnose bei Poolgröße eins, Fortsetzung nach Rollback-/Diagnosefehlern, bestätigte Aufträge trotz Diagnosefehler sowie begrenztes Polling und fremde Bestätigungen. Dies sind kontrollierte Adapter-/Fetch-Simulationen, keine echten parallelen Serververbindungen.
- `git diff --check`: bestanden.

Offen: `stock-authority-races.mjs` benötigt eine separate lokale PostgreSQL-Instanz unter `STOCK_AUTH_TEST_DATABASE_URL`; diese ist in dieser Umgebung nicht vorhanden. Echte konkurrierende Zeilensperren, verspätete Diagnoseupdates unter Parallelbetrieb sowie praktische Geräte-/Netzabbruchabnahme bleiben offen. Kein vollständiger Freigabenachweis und keine Live-Verifikation. Kein Upload, keine Bereitstellung.

## 1. Release offline transaction clients before retry diagnostics

Offline-Fehler geben die ausgeliehene POS-Verbindung nach Rollback frei, bevor der Pool die Wiederholung protokolliert. So wartet ein Pool mit nur einer Verbindung nicht auf sich selbst. Verbindungs-/Rollback-/Diagnosefehler halten andere ausgewählte Verkäufe nicht an; unbrauchbare Verbindungen werden verworfen. Spätere Abnahme: Ein-Verbindungs-Pool, fehlgeschlagenes Rollback und fehlerhafte Diagnoseabfrage.

## 2. Release POS command clients before storing retry failures

Auch reservierungs-/zubereitungsbezogene Lageraufträge geben ihre POS-Verbindung vor der Diagnoseabfrage zurück. Ausfall beim Verbindungsaufbau oder beim Speichern einer Fehlermeldung verhindert weitere unabhängige Aufträge nicht. Beschädigte Rollback-Verbindungen gehen nicht zurück in den freien Pool. Spätere Abnahme: Poolgröße eins, Fehler vor BEGIN und mehrere unabhängige Aufträge.

## 3. Keep committed POS commands complete when connector diagnostics fail

Nach bestätigtem POS-COMMIT wird ein reiner Fehler bei last_sync/last_error nicht als fehlgeschlagener Lagerauftrag behandelt. Es folgt kein Rollback und keine neue Wiederholungsplanung; der Diagnosefehler bleibt für die übergeordnete Stufe erkennbar. Spätere Abnahme: AI-Diagnoseabfrage unmittelbar nach erfolgreichem Commit ausfallen lassen und unveränderten applied-Status prüfen.

## 4. Skip independently locked POS command rows

Neben der Bestellzeile wird auch eine von einem anderen Vorgang gesperrte Lagerauftragszeile übersprungen. Der Worker wartet dadurch nicht mit einer bereits gehaltenen Bestellsperre auf einen fremden Auftrag. Spätere Abnahme: Lagerauftragszeile getrennt sperren und unabhängige Bestellung weiterführen.

## 5. Clear retry schedules for permanently rejected stock commands

Endgültig abgewiesene Lageraufträge räumen die Wiederholungsfrist auf. Die geschützte Statusabfrage liefert eine nächste Fälligkeit ausschließlich bei pending, auch bei älteren Datensätzen mit stehengebliebenem Datum. Spätere Abnahme: transienter Fehler, danach fachliche Ablehnung; kein weiterer Wiederholungszeitpunkt.

## 6. Guard delayed stock error writes with attempt counters and due times

Verspätete Fehler dürfen neuere Fehlversuche oder bereits neu geplante Wartezeiten nicht überschreiben. Beide Worker vergleichen beim atomaren Fehlerupdate den übernommenen Versuchszähler und die aktuelle Fälligkeit. applied/not_linked/conflict bleiben weiterhin geschützt. Spätere Abnahme: A rollt zurück, B plant nächsten Versuch, As ältere Diagnose trifft danach ein.

## 7. Bound persisted stock retry counters and delay calculations

Fehlversuchszähler sättigen an der Integer-Obergrenze statt die Diagnose-/Wiederholungsbuchung durch Überlauf scheitern zu lassen. Die Wartezeit begrenzt auch unerwartet negative Altzähler auf den Ausgangswert. Bestehende Verzögerungsgrenze und Buchungskennungen bleiben erhalten. Spätere Abnahme: Zähler null, negativ und nahe Integer-Maximum.

## 8. Keep malformed errors and failed sales diagnostics from stopping other connectors

Alle Lager-Wiederholungswege erhalten eine begrenzte verständliche Fehlermeldung auch bei geworfenen Zeichenketten oder null statt Error. Im regulären Verkaufsabgleich stoppt eine fehlgeschlagene last_error-Diagnose nicht mehr die folgenden Betriebe; Protokollierung nennt nur Fehlertyp/-code. Spätere Abnahme: fremdes Fehlerformat und Diagnosefehler bei A, erfolgreicher Abgleich bei B.

## 9. Expose scoped offline retry readiness in the existing read-only summary

Die bestehende geschützte Offline-Zusammenfassung ergänzt fällige, wartende und bereits versuchte offene Abgleiche sowie die früheste nächste Fälligkeit. PostgreSQL-Serverzeit entscheidet; Firmen-/Betriebsfilter und bestehende Felder bleiben erhalten. Keine neue Oberfläche oder öffentliche Datenfreigabe. Spätere Abnahme: mehrere Firmen, optionale Betriebsfilter, fällige/wartende Vorgänge und leere Warteschlange.

## 10. Bound POS stock acknowledgement polling without creating new commands

Statusabfragen halten dieselbe Auftragskennung fest, beachten angekündigte Wiederholungsfristen und besitzen pro Abruf ein Zeitlimit sowie insgesamt eine begrenzte Wartezeit. Fremde oder unvollständige Bestätigungen gelten nicht als Erfolg. Bei Verbindungsabbruch bleibt der gespeicherte Auftrag erhalten. Nur GET-Abfragen; keine zusätzliche Lager-, Zahlungs- oder Stornobuchung. Asset-Version aktualisiert. Gemeinsame spätere Fälle und lokale Sammelentscheidung dokumentiert.

# Händlerablauf: Zehnerblock vom 31.10.2026

Grundlage: offener Entwurf #198, Remote-Head 504f60a9f384ab6fe0fc91e2f6dfc14e923e5c9e. Bestehende Funktionen übernommen; keine Produktionsfreigabe.

| Punkt | Ergebnis dieses Blocks |
|---|---|
| 1 Standabgleich | PR und vollständige Dateiliste mit bestehendem Arbeitsstand verglichen; frühere Guthabenlogik wiederverwendet. |
| 2 Registrierung | Bestehender Betriebsregistrierungs-/Anmeldeablauf beibehalten, direkter Einstieg im Händlerbereich ergänzt. Automatische vorhandene Registrierungstests im Shoplauf. |
| 3 Händlerprofil | Bestehender revisionierter, mandantengetrennter Antrag mit manueller Freigabe wiederverwendet. Keine automatische Freigabe. Händlerprofil-/Zustimmungs-/Neulade-/Berechtigungstests ausgeführt. |
| 4 Produktanlage | Vorhandener Angebotseditor und Kontoentwürfe einschließlich Preis/Steuer/Beschreibung geprüft und Einstieg verknüpft. Öffentlicher Produktbild-Upload bleibt unimplementiert; private Dokumente werden nicht veröffentlicht. Punkt damit nicht vollständig abgeschlossen. |
| 5 Bestand/Versand | Vorhandene serverseitige Varianten-/Steuer-/Versandprüfung und atomare Mengenreservierung beibehalten; automatische Bestands-, Preisänderungs-, Rückbuchungs- und Wiederholungstests ausgeführt. |
| 6 Bestellübersicht | Gespeicherte, validierte 5-%-Nettoprovision jetzt je Händlerbestellung sichtbar; historische fehlende/abweichende Berechnungsstände werden nicht erfunden. Anzeige bestätigt keinen Gebührenabzug. |
| 7 Guthaben | Neuer authentifizierter GET /api/v1/shop/marketplace/merchant-credit plus Händleransicht mit Kontostand, bis 50 Buchungen, Kennzeichnung weiterer Buchungen und Auszahlungsvoraussetzung. Rein lesend, eröffnet keine Konten, keine finanziellen POST-Routen. Migration in den bestehenden optionalen Marketplace-Runtime eingebunden. Keine Anbieter-/Bankadapter aktiviert. |
| 8 Mollie-Vorbereitung | Vorhandene Host-/OAuth-/Testcheckout-Komponenten weiterverwendet und automatisiert mit synthetischen Anbieterantworten geprüft. Reale Hostkonfiguration/Autorisierung, Application Fee und Rückerstattungsadapter hier nicht eingerichtet oder bestätigt. Keine echte Mollie-Testzahlung durchgeführt. |
| 9 Automatische Prüfungen | Neue SQL-/HTTP-/UI-Tests für Guthaben und Bestellprovision; umfassender Shoplauf und bestehende Zahlungsprüfungen. Endgültige Ergebnisse unten. |
| 10 Testliste | docs/marketplace-merchant-test-checklist-20261101.md enthält zehn Schritte mit Sollbeträgen, Voraussetzungen und ausdrücklich blockierten Schritten. |

## Neue technische Grenzen
Die Guthabenübersicht zeigt ausschließlich tatsächlich gespeicherte Buchungen. Eine leere Buchhaltung ist keine abgeschlossene Anbindung. Automatische Abrechnung ist ausdrücklich false. Historie enthält keine internen Anbieter-, Bank- oder Kündigungsreferenzen. Konto-, Fokus-, Offline- und Sichtbarkeitswechsel entfernen private Daten; verspätete Antworten werden verworfen. Die neue Journalanzeige ist kein steuerlicher Gutschriftsbeleg.

Keine Änderung an POS/Kellnergestaltung, produktiven Zahlungsschaltern, geschützter Hostkonfiguration, echten Händlerfreigaben oder echten Bestellungen. Der vorhandene AGB-Ergänzungsentwurf bleibt rechtlich ungeprüft und inaktiv.

## Verbleibende Arbeit
Öffentliche Produktbilder; tatsächliche Mollie-TEST-Konfiguration und Händlerzustimmung; verbundene Refund-/Gebühren-/Verrechnungsadapter mit verifizierter Nettozuordnung; Kündigungs-/Bankadapter; rechtliche/umsatzsteuerliche Prüfung; native Browser-/separate PostgreSQL-Abnahme und gemeinsamer Testtermin. Diese Punkte sind nicht als fertig oder bestanden gemeldet.

## Tatsächlich ausgeführte Prüfungen
- Umfassender Shoplauf: 729 Tests, 728 bestanden, 1 Fehler, 0 übersprungen (197 s). Der Fehler betraf die schon in #198 hinzugefügte merchant-terms.html ohne vorgeschriebenen Assistenten-Link. Bestehendes Header-Muster übernommen; danach beide Navigationstests bestanden. Kein erneuter vollständiger Shoplauf nach dieser isolierten Headerkorrektur behauptet.
- Finale neue Guthaben-/HTTP-/UI-/Provisionsprüfungen: 8/8 bestanden, 0 übersprungen (einschließlich abschließender Fokus-/Offlinekorrektur).
- Fokussiert Händlerfreigabe, Veröffentlichung und Guthabenjournal: 27/27 bestanden.
- Mollie-/Marketplace-/Provisionslauf: zunächst 72 bestanden, 2 Imports wegen lokal fehlendem pg-Paket fehlgeschlagen. Vorhandene lokale Abhängigkeit wiederverwendet; gezielter Nachlauf 13 bestanden, 0 Fehler, 4 PostgreSQL-Abnahmen mangels separatem Testserver übersprungen. Dies ergibt 85 bestandene Zahlungs-/Provisionsprüfungen über beide Läufe; keine echte Mollie-Abnahme.
- Geänderte JavaScript-Dateien syntaktisch geprüft; Händler-HTML geparst, IDs eindeutig; git diff --check ohne Befund. Keine native Browserabnahme in dieser Sitzung, weil das lokale Chromium-Programm fehlt.

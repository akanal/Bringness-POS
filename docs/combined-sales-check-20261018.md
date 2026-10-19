# Gemeinsamer Ablauf: Kunde, Verkauf, Rechnung, Kassenabschluss

Codebasis: auf GitHub bestätigter Commit 5260050, einschließlich Kunden/Lieferscheinen, Kassenschichten und Händlerrechnung nach Foto 91941. Erweiterung: tatsächlicher zusammenhängender HTTP-Integrationstest in server/ai-tests/trade.mjs. Nur synthetische Daten in isolierter Testdatenbank; keine produktive Zahlung, E-Mail oder Liveschaltung.

## Ergebnisse

| Prüfung | Ergebnis | Ursache / nächster Fix |
|---|---|---|
| Kunde speichern, suchen und Empfänger wiederverwenden | bestanden | echte Kunden-API mit demselben authentifizierten Checkout-Handler |
| Unbezahlter Lieferschein, Retry | bestanden | dieselbe Dokument-ID, keine Zahlung vor Verkauf |
| Händlerverkauf mit gespeicherter Kundenadresse | bestanden | serverseitiger Mengenstaffelpreis und tatsächliche Barzahlung |
| A4-Rechnung über echte Belegroute | bestanden | PDF-Dimensionen, Empfänger, Betrag und Fiskalhinweis ausgelesen |
| Händlerrechnung nach Foto, mehrseitiger Druck | bestanden in bestehendem PDF-Test | Anschrift/Datenblock/Tabelle/graue Summenzeilen; keine fremden Firmen-/Bankdaten übernommen |
| Normale Barverkäufe und Händlerumsätze gemeinsam abschließen | bestanden | 10 EUR Anfang, 3.000 EUR Händler, 99,99 EUR normal, 5 EUR Einlage, 2 EUR Entnahme ergeben 3.112,99 EUR Soll |
| Getrennte Auswertung | bestanden | Händler 3.000 EUR, normal 99,99 EUR; gemeinsamer Bargeldbestand |
| Gezählter Bestand, Abschluss und wiederholte Anfrage | bestanden | Differenz null; unveränderter Abschluss und keine zweite Barbuchung |
| Bedienungstests Händler/Kunden/Kassenabschluss | bestanden | gespeicherte Vorgangskennungen, Wiederaufnahme und Fehlerfälle |
| Unit-Tests | bestanden: 515/515 | keine Fehler |
| Öffentliche POS-Seite und Health über HTTPS | erreichbar: HTTP 200 | belegt Erreichbarkeit, keine authentifizierte Funktionsprüfung |
| Direkter SSH-Zugriff aus dieser Arbeitsumgebung | fehlgeschlagen: OSError | kein Nachweis eines Serverausfalls; Netzwerk-/Zugriffsweg dieser Umgebung getrennt von GitHub-Automation betrachten |

## Grenzen / Veröffentlichung

Kassenabschluss ist eine serverseitige Schichtabrechnung, kein vollständiger fiskalischer Z-Abschluss. Ohne offene Schicht oder verspätet eintreffende Offlinezahlungen benötigen weiterhin eine gesonderte Abstimmung; geschlossene Berichte werden nicht rückwirkend verändert. Belegzahlung kommt aus den gespeicherten Zahlungsdaten; das Rechnungsfoto schaltet keine Karten-/Onlinezahlung frei. Normale Verkäufe behalten den Bon.

PR #90 bleibt die Kundenbasis; Kasse/Rechnung liegen auf feat/cash-closing-20261018. Kein Merge nach main, keine Änderung der Deployment-Konfiguration und kein erneuter produktiver Deploy in diesem Durchgang. Die öffentliche Anwendung ist erreichbar; authentifizierter Netcup-Status ist aus dem direkten SSH-Test nicht ableitbar. Produktive Freigabe bleibt gesondert erforderlich.

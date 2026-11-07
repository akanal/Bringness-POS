# POS: Bestätigung einer bereits gespeicherten Zählung wiederherstellen

Stand: 07.11.2026, PR269.

## Problem und Verhalten

Ein Zählstand kann gespeichert sein, während seine HTTP-Antwort verloren geht. Wurde der Artikel vor dem nächsten Versuch deaktiviert, prüfte die API zunächst dessen aktuellen Aktivstatus und wies auch den identischen bereits bestätigten Vorgang ab. Die Kasse konnte dadurch den ursprünglichen Erfolg nicht mehr eindeutig feststellen.

Nach gültiger aktueller Anmeldung, Rollenprüfung und Berechtigung für den ursprünglichen Betrieb wird jetzt zuerst die vorhandene Vorgangskennung geprüft. Stimmen Kennung und unveränderter Inhalt überein, wird ausschließlich die ursprüngliche Bestätigung zurückgegeben. Das ändert weder Menge, Revision noch Zählzeitpunkt. Auch nach einer späteren weiteren Zählung bleibt die alte Bestätigung unverändert; sie setzt keinen aktuellen Bestand zurück.

Neue Vorgänge benötigen weiterhin einen aktiven Artikel im ausgewählten Betrieb. Geänderter Inhalt derselben Kennung bleibt ein Konflikt. Abgelaufene/entzogene Anmeldungen, Kellnerrollen und fremde Betriebe erhalten keine Bestätigung. Keine neue Tabelle, Migration, Preis-/Lizenzregel oder Rechtevergabe. Keine Änderung an Markt, AI oder POS-Gestaltung.

## Prüfung

Lokal705 allgemeine Tests und11 Bestands-DOM-Fälle erfolgreich. Tatsächliche HTTP-/SQL-Prüfung mit isolierter PGlite-Datenbank: Deaktivieren nach Speicherung, identische Wiederholung ohne Änderung von Anzahl/Revision/Zeit, Ablehnung neuer Zählung und geänderter Wiederholung, weiterhin aktuelle Sitzungs-/Rollen-/Betriebsprüfung sowie alte Bestätigung nach neuer Zählung. UI-Prüfung verliert die Bestätigung, entfernt den Artikel aus der Liste und klärt denselben Vorgang erneut, ohne den Artikel wiederherzustellen oder eine zweite Buchung zu erzeugen.

Keine produktiven Konten oder Zählstände zur Abnahme schreiben. Windows-Auslieferung bleibt entsprechend der kostenlosen Signaturentscheidung unverändert gesperrt.

## Quellstand und Prüfbelege

Feature1b55f67f1100d1b20cbc4afe1bb6754e01396938 / Treec5865815bd15eb535363be1b8435f7cab15cb0e6 / Merge14687cc1f0030ab87ccaeed19c27ca1cda1d9096. Alle fünf PR-CI erfolgreich: POS/AI42422167025/job128552722070 (einschließlich tatsächlicher HTTP-/SQL-Wiederherstellung), Shop42422166891/job128552721732 mit805 Tests und tatsächlichem PostgreSQL-/HTTP-/Browser-Einstieg, isoliert42422166828, checks42422166986, release42422166825.

Frische authentifizierte Sicherung42211075899/job128552719411 bestätigt Database backups validated.

Netcup42422768656/job128554542423 deployt exakt14687cc1f0030ab87ccaeed19c27ca1cda1d9096; vorheriger Container und Datenbanksicherung behalten. Live-HTTP-Abnahme: Health200/no-store, POS-Einstieg200, unveränderte app.js200/bytegleich und privater Bestandsendpunkt ohne Anmeldung401/no-store. Keine produktiven Bestandsänderungen für die Abnahme vorgenommen.

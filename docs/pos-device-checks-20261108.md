# POS: gespeicherte Geräte-Prüfprotokolle — Zehnerblock

## Umsetzung

1. Gerät/Arbeitsplatz im bestehenden Scanner- oder Druckerbereich benennen. Kein Geräte-Fingerabdruck, keine Seriennummer-Ermittlung und kein Lizenzgerät anlegen.
2. Bestehenden Scannertest weiterverwenden: Sollcode vom Etikett mit empfangenem Code vergleichen. Gleicher Text ist noch keine Hardwarebestätigung; diese wählt der Benutzer ausdrücklich.
3. Bestehenden Testdruck weiterverwenden. 58-/80-mm-Auswahl formatiert ausschließlich den Testtext; keine Änderung von Rechnungen, Druckertreiber oder tatsächlicher Papierkonfiguration.
4. Testdruck anfordern und Papier, Lesbarkeit, Sonderzeichen sowie Ausgabe/Schnitt/Abriss ausdrücklich prüfen. Neuer Test/andere Geräteangaben entwerten vorherige Bestätigungen.
5. Ungeprüft, Problem und vom Benutzer bestätigt getrennt speichern. Probleme verlangen eine Beschreibung. Bestätigung des Druckers erfordert vollständige Angaben; Scannerbestätigung erfordert gleichen nichtleeren Soll-/Istcode. Quelle bleibt immer user_report, Protokollversion1. Der Server kann keine echte Hardwareprüfung oder tatsächlich gedrucktes Papier attestieren.
6. Explizit speichern mit Server-Speicherzeitpunkt, interner Kontokennung und damaliger Anzeigenbezeichnung. Keine E-Mail-Adressen, keine clientseitige Rückdatierung und keine alten flüchtigen Tests nachträglich eintragen.
7. Protokolle nur für aktuell berechtigte aktive Inhaber/Admins des Betriebs und der Firma. Firmenbindung auch bei weiteren Seiten und beim erneuten Abruf für CSV. Schreibgeschützter Verlauf; keine neue Benutzer-/Lizenzfreigabe und keine Verbindung mit Markt/AI-Beständen.
8. Anfragekennung und Inhalt bei verlorener Antwort beibehalten. Wiederholung erzeugt einen Eintrag und erhält Zeitpunkt/ursprüngliches Konto. Bereits bestätigtes Speichern bleibt bekannt erfolgreich, wenn nur das anschließende Laden des Verlaufs ausfällt.
9. Ein gespeichertes Prüfprotokoll nach erneuter Zugriffskontrolle als CSV exportieren, mit Formelschutz und eindeutiger Kennzeichnung als Benutzerangabe. Keine automatische E-Mail oder Übermittlung an andere Personen.
10. SQL-/HTTP-, Oberflächen- und tatsächliche PostgreSQL-/Browserfälle prüfen; vorhandenen Netcup-Weg mit Sicherung, Rückfall und Live-Kontrolle verwenden.

## Bedienung

POS → Einstellungen → Bestand und Geräteprüfung. Erst Betrieb/Zählstände, dann Prüfprotokolle laden. Geräteangaben ergänzen, vorhandenen Test durchführen, Ergebnis ausdrücklich wählen und speichern. Im gespeicherten Verlauf einen Eintrag aufklappen und diesen als CSV exportieren. Scanner-/Druckertest bleiben auch ohne Protokollbindung nutzbar; dabei wird kein Protokoll automatisch erzeugt.

Offene Geräteangaben nehmen am vorhandenen Verlassens-/Betriebswechsel-Schutz teil. Unbestätigte Speicherungen sperren Änderungen bis zur Klärung mit derselben Kennung. Andere Bestandsentwürfe bleiben erhalten. Ein Geräteentwurf sperrt keine unabhängigen Bestands-CSV-Exporte; während eines laufenden/unklaren Vorgangs gelten die vorhandenen Sperren. Sitzungs-/Betriebswechsel löscht private Eingaben; späte Antworten dürfen sie nicht wiederherstellen. Erzwungenes Schließen ist keine garantierte Entwurfssicherung.

Gespeicherte Protokolle sind unveränderliche Benutzerberichte. Datenbanktrigger verhindern normale UPDATE/DELETE/TRUNCATE, nicht Manipulation durch einen Datenbankadministrator. Es entsteht weder Geräte-/TSE-Zertifizierung noch eine Bestands-, Verkaufs- oder Lieferantenbuchung. Ein altes Protokoll gilt nicht automatisch für ein anderes Gerät, einen anderen Arbeitsplatz oder einen späteren Test.

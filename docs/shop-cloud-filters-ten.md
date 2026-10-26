# Kontoentwürfe: Suche, Filter und Sicherung

1. Kontoentwürfe werden serverseitig über Titel, Kategorie, Artikelnummer, Beschreibung, Versand und Bereitstellung durchsucht. Mehrere Suchwörter dürfen in unterschiedlicher Reihenfolge vorkommen.
2. Auch die gespeicherte EAN/GTIN wird durchsucht. Enter im Suchformular lädt ausdrücklich die Suche; Tastaturscanner können diese Eingabe nutzen. Es wurde keine reale Scannerhardware geprüft.
3. Kategorien berücksichtigen gemeinsame Unterkategorien. Beispielsweise enthält Haus & Garten auch Baumarkt.
4. Waren, digitale Produkte und Dienstleistungen lassen sich getrennt filtern.
5. Bestandsfilter unterscheiden Waren mit und ohne Bestand. Digitale Produkte und Dienstleistungen werden nicht als Waren ohne Bestand behandelt.
6. Filter und Gesamtzahl werden in derselben Datenbanktransaktion ermittelt. Jede weitere Seite erhält die gleiche Filterkombination. Die Anzeige nennt geladene Zeilen und Treffer der letzten Abfrage, ohne eine unveränderliche Gesamtsicht über mehrere Abfragen zu versprechen.
7. Alle Filter lassen sich ohne automatische Anfrage zurücksetzen. Ein Filterwechsel entfernt alte Ergebnisse; erneutes Laden bleibt ausdrücklich.
8. Kachel- und Listenansicht wechseln lokal ohne Serveranfrage.
9. Die Sicherung enthält ausschließlich bereits geladene validierte Ergebnisse. Für lokale Bearbeitung können Abschnitte von höchstens 25 Entwürfen ausgewählt werden. Es werden keine Seiten automatisch nachgeladen, keine Kontodaten oder Berechtigungsnachweise exportiert und keine Entwürfe im Konto verändert. Lokaler Import bleibt auf 50 Entwürfe insgesamt und 600 KB je Datei begrenzt; größere Gesamtsicherungen sind Dateisicherungen.
10. Betriebsbindung, Ergebnisprüfung, Zähler und Bedienzustand werden auch nach verspäteten Antworten, Kontowechsel und pausierter Ansicht geprüft beziehungsweise verworfen. Historien-/Archivaktionen und Export werden an die geladene Browseridentität gebunden. Anbieterhilfe erklärt den Umfang der Sicherung.

Die API bleibt GET /api/v1/shop/seller/offers mit Bearer-Authentifizierung und aktiver Inhaber-/Administratorrolle. Neue optionale Parameter: category, kind, stock. Bestehende q/state/cursor bleiben unterstützt. Antwort ergänzt total und filters; Reihenfolge und Cursor bleiben ID-basiert, maximal 25 Zeilen pro Seite. Eingaben: höchstens 120 Zeichen und 15 Suchwörter, feste Filterwerte, keine unbekannten oder doppelten Parameter. Alle SQL-Werte sind Parameter. Kunden- und Zahlungsdaten bleiben unverändert; keine Veröffentlichung.

Prüfungen verwenden isolierte Datenbanken, echte HTTP-Anfragen, DOM-Tests für Export/Pagination/verspätete Antworten und tatsächliche Anwendung mit PostgreSQL/Chromium. Keine Produktionskonten oder echten Anbieteraufrufe werden zum Testen angelegt beziehungsweise ausgeführt.

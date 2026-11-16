# POS-Fehlercodes

Erster Umfang: eigenständige Anmeldung/Registrierung und Passwort-Wiederherstellung,
gemeinsame POS-API für Lade-/Speicheraktionen und bestehende Server-/Datenbank-Verbindungsprüfung.
Die bisherigen CD-Codes des Kundendisplays bleiben separat. Eigenständige Erweiterungen,
die die gemeinsame API umgehen, sind dadurch nicht vollständig abgedeckt.

Codeform: `POS-<Bereich>-<Ursache>`.

| Bereich | Bedeutung |
| --- | --- |
| LOGIN / REGISTER | Anmeldung / Registrierung |
| RESET | Passwort-Wiederherstellung |
| LOAD / SAVE | Lesen / Schreiben über die gemeinsame POS-API |
| CONNECTION | bestehende Health-Verbindungsprüfung |
| START | Kassenprogramm nicht vollständig gestartet |

| Ursache | Bedeutung |
| --- | --- |
| AUTH / ACCESS | HTTP 401 / 403 |
| LIMIT | HTTP 429 |
| TIMEOUT | bestätigte Zeitüberschreitung oder HTTP 408/504 |
| SERVER | HTTP 5xx oder Health meldet Server/Datenbank nicht bereit |
| REQUEST | übrige HTTP 4xx |
| NETWORK | Anfrage technisch gescheitert; kein Beweis für die genaue Netzursache |
| RESPONSE | Antwort nicht als erwartetes JSON-Objekt/Bestätigung lesbar |
| STORAGE | benötigter Sitzungsspeicher blockiert |
| FAILED | Ursache nicht genauer zugeordnet |

Die Meldung behält ihren vorhandenen Erklärungstext. Das Diagnosefeld zeigt einen
kopierbaren Code. Export: ausschließlich Code, UTC-Zeit, feste Komponentenversion,
Onlineflag. Keine Pfade/URLs/Parameter, Namen, Kennungen, Formulare, Passwörter,
Tokens, Belege, Warenkorbdaten, Rohfehler oder Stacks. Die lokale Kopie bleibt
flüchtig. Die ausdrücklich beauftragte automatische Adminmeldung ist unten beschrieben. Schließen, Betriebswechsel, Sitzungstausch
in einem anderen Tab und Verlassen entfernen die flüchtige Diagnose.
Clipboardfehler bieten schreibgeschützten markierbaren Text. Späte Kopierantworten
zeigen nach dem Schließen/Wechsel nichts erneut an. Hintergrund-Healthmeldungen
überschreiben keine konkrete Aktionsdiagnose; alte Sitzungsanfragen ebenfalls nicht.

Der Code kategorisiert den Fehler und ist keine eindeutige Vorgangs-ID oder
serverseitige Protokollreferenz. Nicht auf eine Kontenexistenz beim Reset schließen:
die bisherige allgemeine Bestätigung bleibt erhalten.

Bei technischen Fehlern einer Schreibanfrage ist der Speicherstatus möglicherweise
unklar. Zuerst bestehenden Vorgang abgleichen, nicht mit neuer Kennung wiederholen.
Keine zusätzlichen automatischen Wiederholungen, keine Änderungen der bestehenden
Zahlungs-/Idempotenzregeln oder der bisherigen Zeitlimits. HTTP-Metadaten und
Lagerauftrag-/Pending-Eigenschaften bleiben erhalten.

Automatisierte Abnahme: `node server/ai-tests/pos-diagnostics.mjs` (isolierte jsdom-
Abhängigkeit aus server/ai-tests), bestehende Authregression und neuer nativer
Chromium-/WebKit-Fall in `server/pos-payment-browser.test.js`. Nur synthetische Daten.

## Eigenständige Erweiterungen

Die eigenen JSON-API-Helfer von Bildschirmverwaltung (`DISPLAY`),
Personalverwaltung (`PERSONNEL`), Artikelzusätzen/Dienstplan (`CATALOG`),
Steuerberaterzugriff (`TAX`) und Verfügbarkeitsregeln (`AVAILABILITY`) nutzen
nun dieselbe flüchtige Diagnose. HTTP-Status und vorhandene Fehlercodes bleiben
am Fehler; Personalfreigabe-Header werden weiterhin durch den bestehenden
Fetch-Helfer ergänzt. Keine automatische Wiederholung oder neue Zeitgrenze.
Fehlende/ungültige JSON-Antworten werden erkannt; bei verlorenen Schreibantworten
oder Serverfehlern zuerst den gespeicherten Stand abgleichen. Antworten alter
Anmeldesitzungen/Betriebe erzeugen kein Diagnosefeld in der neuen Sitzung.

Die Erweiterung erfasst die genannten Helfer, nicht sämtliche direkten Fetchs,
Binärdownloads, eingebetteten Fremdansichten oder eigenständigen Seiten.
Vorhandene Rückmeldungen, Rechte, PIN-Prüfungen und Zahlungsregeln bleiben bestehen.

## Bestand und Händler

`STOCK` kennzeichnet die separate Bestands-/Zählverwaltung einschließlich Historie
sowie Lagerauftragsanfragen der gemeinsamen POS-API. Geräteprüfungen auf derselben
Seite behalten die allgemeinen Bereiche LOAD/SAVE. `TRADE` kennzeichnet Anfragen
unter `/trade` und den gespeicherten PDF-Aufruf einer Händlerrechnung. Die separate
Bestandsseite lädt Diagnosecode und Styles selbst; das Feld steht bei der bestehenden
Statusmeldung, nicht nur im übergeordneten Kassenfenster.

Bestandsfehler erhalten weiterhin HTTP-Status, fachlichen Code und die bisherige
Unterscheidung zwischen eindeutiger Ablehnung und unbestätigtem Speichern. Fehlerhafte
oder nicht zuordenbare Bestätigungen behalten den bestehenden Auftrag zum ausdrücklichen
Abgleich; keine neue Kennung oder automatische Wiederholung. JSON-fremde 4xx-Antworten
werden nicht als fachlich eindeutige Ablehnung ausgegeben. Alte Konto-/Betriebs-/
Seitenantworten erzeugen kein neues Diagnosefeld. Lager-Polling erhält seine Kennung,
pending-Eigenschaft und bestehenden Zeitgrenzen. Ein Fehler dieses Abgleichs erhält
auch dann STOCK, wenn die ursprüngliche Anfrage beispielsweise eine Artikeländerung war.

`pdfRequest` liest ein PDF einmal mit den vom Aufrufer gesetzten Berechtigungen.
HTTP-Fehler, Transportfehler, abgebrochene/ungültige Blob-Antworten, leere Dateien
und falsche MIME-Typen erhalten den passenden Code. Es werden keine Inhalte exportiert,
keine zusätzlichen Verkäufe erzeugt und keine Downloads wiederholt. Die bestehende
Rechnungsanzeige bleibt für Objekt-URLs und Lebensdauer zuständig.

Diese Erweiterung umfasst nicht sämtliche separaten Geräte-/Import-/Supportseiten,
Pfandjournale, Rechnungs-/Steuerdownloads außerhalb des Händlerdialogs oder die
separate AI-Oberfläche. Die praktische Abnahme durch den Inhaber bleibt verschoben;
automatisierte native Prüfungen verwenden ausschließlich synthetische Daten.


## Automatische Adminmeldung — 16.11.2026

Codes erscheinen weiterhin nur nach einem erkannten Fehler. Angemeldete Kassen
melden technische Kategorien NETWORK, TIMEOUT, RESPONSE, SERVER, STORAGE und FAILED
best-effort an das eigene `/api/v1/pos-diagnostics`. Erwartete Ablehnungen (AUTH,
ACCESS, LIMIT, REQUEST) bleiben lokal. Kein globaler Fetch-Interceptor und keine
Übertragung von Rohfehlern, Formularen, URLs, Kunden-, Beleg- oder Zahlungsdaten.

Die Nachricht enthält ausschließlich eine zufällige Ereigniskennung, festen Code,
feste Komponentenversion, Onlineflag und optional die ausgewählte Betriebs-UUID.
Der Server prüft eine aktive Sitzung und die Betriebszugehörigkeit; Mandant und
Empfangszeit werden serverseitig ergänzt. Vor der Anmeldung oder bei blockiertem
Sitzungsspeicher bleibt die Diagnose lokal. Bestehende Kundenfreigaben für
Fernzugriff werden dadurch weder erteilt noch umgangen.

Der Browser bündelt gleiche Codes je Betrieb für zwei Minuten. Bis zu20 Meldungen
bleiben maximal15 Minuten im Arbeitsspeicher, ohne neue Browserpersistenz. Bei
Online-Rückkehr bzw. nach30 Sekunden erfolgt ein erneuter Übertragungsversuch,
maximal drei Versuche je Ereignis mit identischer Kennung. Konten-/Betriebswechsel,
Seitenende und Neuladen verwerfen die Warteschlange. Übertragungsfehler bleiben
still und erzeugen keine neue Diagnose. Es werden ausschließlich Diagnosemeldungen
wiederholt, niemals Zahlungen oder andere fachliche Schreibanfragen.

Der Server begrenzt auf12 Meldungen je Nutzer und120 insgesamt pro Minute und
fasst gleiche Codes je Mandant/Betrieb/Version zusammen. Gleiche Ereignisse zählen
auch bei parallelen Wiederholungen nur einmal. Ereigniskennungen werden nach24h,
zusammengefasste Meldungen nach30 Tagen gelöscht (Bereinigung beim Start und
stündlich). Die Übersicht zeigt höchstens die100 neuesten passenden Meldungen.

Nur aktive Bringness-Plattformadministratoren sehen `/admin/` → POS →
Automatische Fehlermeldungen. Der POS-Reiter zeigt die Anzahl offener Fälle;
bei sichtbarer Adminseite wird spätestens minütlich aktualisiert. Zustände:
offen, in Bearbeitung, als behoben markiert. Statusänderungen benötigen die aktuelle
Revision und werden protokolliert. Neue Vorkommen öffnen behobene Fälle erneut.
„Als behoben“ ist eine manuelle Bearbeitungsmarkierung, kein automatischer
Reparaturnachweis. Keine externe E-Mail, kein unbeaufsichtigter Kontozugriff,
keine automatische Reparatur oder Änderung von Kassen-/Finanzdaten.

Früheres Erkennen ist möglich, aber bei Netzausfall, geschlossenem Browser,
fehlender Sitzung oder Ausfall des Empfangsservers nicht garantiert. Für Fehler,
die eine Bedienerentscheidung erfordern, bleiben die vorhandenen Hinweise sichtbar.

Prüfung: `node server/ai-tests/pos-diagnostic-reports.mjs` (PGlite und über
POS_DIAGNOSTIC_TEST_DATABASE_URL echtes isoliertes PostgreSQL),
`node --test ops/shop/pos-diagnostic-delivery.test.mjs ops/shop/pos-diagnostic-admin.test.mjs`,
native Chromium/WebKit-Fälle in `server/pos-payment-browser.test.js`.

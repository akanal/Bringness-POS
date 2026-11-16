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
Tokens, Belege, Warenkorbdaten, Rohfehler oder Stacks. Kein Versand, keine neue
Persistenz und keine Diagnosehistorie. Schließen, Betriebswechsel, Sitzungstausch
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

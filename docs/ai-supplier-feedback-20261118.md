# Bestell- und Lieferrückmeldungen externer Lieferantensysteme

Der nächste vom Eigentümer beauftragte AI-Block erweitert die bestehende
Lieferanten-API. Es wird kein bestimmtes ERP angeschlossen und keine externe
Lieferantenanmeldung oder ein neuer Vertrag eingerichtet. Bestehende Produkte,
Verkäufe, Restaurantzustimmungen, Waren- und Provisionsbuchungen bleiben der
maßgebliche Geschäftsablauf.

| Anfrage | Verhalten |
| --- | --- |
| `GET /api/ai/v1/supplier/orders` | Bestehender Mikrosekunden-Cursor; zusätzlich Gruppenkennung, bestätigter Termin, Nichtlieferbarkeit, ursprüngliche/tatsächliche Mengen und Werte sowie neuester Ersatzvorschlag |
| `GET /api/ai/v1/supplier/order-groups/:groupId` | Alle eigenen Positionen des Lieferauftrags gemeinsam; ohne Gruppenkennung gilt die ursprüngliche Bestell-ID. Bis 500 Positionen, sonst ausdrücklicher Fehler statt unvollständiger Antwort |
| `POST /api/ai/v1/supplier/order-groups/:groupId/accept` | Alle offenen Positionen mit einem ausdrücklich bestätigten Liefertermin annehmen; bekannte Lieferprobleme sperren die Annahme |
| `POST /api/ai/v1/supplier/order-groups/:groupId/cancel` | Noch offene Positionen mit Begründung stornieren; abgeschlossene Positionen bleiben unverändert |
| `POST /api/ai/v1/supplier/orders/:orderId/unavailable` | Nichtlieferbarkeit begründet melden; nur explizites `pauseProduct:true` pausiert zusätzlich das eigene Katalogprodukt |
| `POST /api/ai/v1/supplier/orders/:orderId/replacement` | Eigenes lieferbares Ersatzprodukt mit passender Einheit und ganzen Packungen vorschlagen; keine Ersetzung vor Restaurantzustimmung |

## Vertrag für Rückmeldungen

Neue Schreibaufrufe verlangen `requestId` (UUID) und `confirmed:true`, Annahmen
zusätzlich `deliveryDate`, Stornierungen/Nichtlieferbarkeit/Ersatz eine Begründung.
Ersatz ergänzt `productId` und ganze `packs`. Unbekannte Felder werden abgewiesen.
Bestätigte Termine sind Berliner Kalendertage, heute oder später. Vor dem Senden
Kennung und exakte Nutzdaten im angebundenen System dauerhaft speichern.

Gleiche Kennung und gleiche kanonische Daten geben die gespeicherte ursprüngliche
Bestätigung mit `replayed:true` zurück. Abweichende Daten unter derselben Kennung
liefern409. Der Vorgang ist pro Lieferant und Verbindung gebunden. Eine verlorene
Antwort benötigt keine neue Kennung. Eine alte Wiederholung setzt weder einen
neueren Termin zurück noch öffnet sie einen inzwischen stornierten Auftrag.

Die neue API delegiert ausschließlich die erlaubten Lieferantenaktionen an
`fulfilmentRoutes`. Restaurantzustimmung, Wareneingang, Lagerkorrektur, Zahlung
und Provisionsausgleich werden nicht delegiert. Nach zugestimmtem Ersatz muss der
geänderte Auftrag erneut mit Liefertermin bestätigt werden. Die vorhandenen
Angebots-, Packungs-, SEPA-/Handelsfreigaben und gespeicherten 2%-Regeln gelten
weiterhin. Bestellabrufe sind aktuelle Zustände, keine vollständige Ereignisfolge.

Ersatzvorschlag und Entscheidung aktualisieren auch den Bestell-Zeitstempel,
damit der vorhandene Cursor diese Änderungen meldet. Es gibt keine automatische
Wiederholung von Geschäftsaktionen durch einen neuen Hintergrundworker und
keinen Webhookversand. Ein echter Herstelleradapter benötigt später dessen
Schnittstellenvertrag, Artikelzuordnung und Testzugang.

## Transaktion und Rechte

Vor jeder neuen oder wiederholten Lieferantenänderung werden aktuelles aktives
Lieferantenkonto und aktiver, weiterhin passender Schlüssel innerhalb derselben
Transaktion erneut gesperrt/geprüft. Reihenfolge: Konto mit `NO KEY UPDATE`,
Verbindung, anschließend Geschäftsobjekte. So bleibt die Reihenfolge mit der
bestehenden Schlüsselrotation vereinbar und unnötige Konflikte mit Fremdschlüsseln
werden vermieden. Auch Produktimporte und kompatible Einzelannahmen verwenden
die gemeinsame Prüfung.

Geschäftsänderung, Audit und Replaybestätigung werden gemeinsam bestätigt oder
vollständig zurückgerollt. Der Datenbankclient bleibt bis zum bestätigten Abschluss
reserviert. Fremde Aufträge bleiben404. Eine vor dem Transaktionsbeginn erfolgte
Sperrung oder Schlüsselrotation verhindert die Änderung und auch einen alten Replay.

## Technische Prüfung und spätere Abnahme

- Reine Eingabetests: kanonische Wiederholung, erlaubte Lieferantenaktionen,
  unbekannte/gefälschte Akteursfelder, ungültige Termine, fehlende Zustimmung,
  nicht boolesche Produktsperre und ungültige Packungsmengen.
- Bestehende vollständige HTTP/PGlite/DOM-Integration ergänzt um bestätigte
  Lieferdaten, unveränderte alte Wiederholung, Replaykonflikte, fremde Aufträge,
  Nichtlieferbarkeit, auditierten Replay ohne zweite Meldung, Ersatzvorschlag,
  ausdrückliche Restaurantzustimmung, neue kommerzielle Snapshots und unveränderten
  Lagerbestand. In-flight-Kontosperrung und Schlüsselrotation werden nach der
  ursprünglichen Authentifizierung vor Transaktionsbeginn injiziert.
- `server/ai-tests/supplier-updates-postgres.mjs` prüft mit tatsächlichen separaten
  PostgreSQL-Sitzungen beobachtete Sperrwarteschlangen, gleichzeitige identische
  und widersprüchliche Vorgänge, Schlüsselrotations-/Kontosperren sowie vollständigen
  Auditfehler-Rollback und Wiederholung. Der bestehende POS/AI-Workflow führt ihn
  auf seiner isolierten PostgreSQL-16-Testdatenbank aus. Ein vorbereiteter Test ist
  vor erfolgreichem CI-Lauf kein Beleg seiner tatsächlichen Ausführung.

Es werden keine echten Lieferantenaufträge, Zahlungen oder produktiven Testkonten
angelegt. Die praktische Inhaberabnahme bleibt verschoben. App-Commit, alle
Pflichtprüfungen, AI-only-Netcup-Deployment und anschließende Livekontrolle werden
im Übergabenachweis getrennt dokumentiert.

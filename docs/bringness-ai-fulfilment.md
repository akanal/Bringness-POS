# Lieferantenaufträge, Ersatz und tatsächlicher Wareneingang

## Bedienung

Bestellungen erscheinen als vollständige Lieferantenaufträge. Die letzten 100 Aufträge werden mit allen zugehörigen Positionen geladen; eine Liste wird nicht mitten im Auftrag abgeschnitten. Einzelbestellungen aus dem bisherigen Ablauf bleiben als eigener Auftrag erreichbar.

- Lieferant bestätigt alle offenen Positionen gemeinsam und nennt einen bestätigten Liefertermin. Das Restaurant sieht Wunschdatum und bestätigten Termin.
- Lieferant meldet eine nicht lieferbare Position mit Begründung. Optional wird das Produkt zusätzlich im Shop als nicht lieferbar markiert. Annahme und Wareneingang der betroffenen Position sind gesperrt, bis Ersatz zugestimmt oder die Position storniert wurde. Andere Positionen können nach Stornierung der fehlenden Position erfüllt werden.
- Lieferant schlägt ein lieferbares Produkt seines eigenen Sortiments mit derselben Einheit und ganzen Packungen vor. Ursprüngliche Bestellung bleibt zunächst unverändert. Restaurant sieht ursprünglichen und vorgeschlagenen Packungsinhalt, Menge und Nettowert und stimmt ausdrücklich zu oder lehnt ab. Vor Zustimmung werden aktuelle Angebotsdaten nochmals überprüft. Nach Zustimmung muss der Lieferant den geänderten Auftrag und Termin erneut bestätigen.
- Restaurant trägt tatsächliche Packungsmengen für alle offenen angenommenen Positionen ein. Bruchteile mit bis zu drei Nachkommastellen sind möglich, wenn auch der Inhaltszuwachs auf drei Nachkommastellen genau ist. Überlieferung ist gesperrt. Mindermengen benötigen eine Begründung; null bedeutet nicht geliefert.
- Die Wareneingangsbestätigung schließt die offenen Positionen endgültig ab. Es gibt keine automatische Restmengenbestellung und keine weitere Teilbuchung dieses abgeschlossenen Auftrags. Bereits abgeschlossene oder stornierte Positionen bleiben unverändert.

Die Oberfläche zeigt den Warenwert der eingetragenen Liefermengen und die Lieferantenprovision vor der Bestätigung. Warenwert wird anhand des vereinbarten Nettowerts anteilig auf Cent gerundet. Provision beträgt weiterhin 2 % auf diesen tatsächlichen Wert; Lager erhält ausschließlich den tatsächlichen Inhaltszuwachs. Ursprüngliche Mengen/Werte und Entscheidungen bleiben über Bestelldaten und Audit nachvollziehbar. Provisionsabrechnungen und automatische Rechnungen verwenden den angepassten tatsächlichen Wert; bereits abgeschlossene oder abgerechnete Aufträge können hier nicht nachträglich verändert werden.

## Adminmeldungen

Nichtlieferbarkeit und Mindermengen erzeugen dauerhafte Einträge unter **Liefermeldungen** im Superadminbereich. Sichtbar sind Lieferant, Restaurant, Produkt, Auftragskennung, Begründung sowie bei Mindermengen ursprüngliche/tatsächliche Menge, Warenwert und Provision.

Ein Zähler für ungelesene offene Meldungen steht am Reiter. Während einer angemeldeten Adminsitzung wird er etwa jede Minute aktualisiert. **Als gelesen markieren** bestätigt nur die Kenntnisnahme; es verändert weder Bestellstatus noch Abrechnung. Ersatz-Zustimmung und Stornierung erledigen die zugehörige Nichtlieferbarkeitsmeldung, die Historie bleibt erhalten. Identische Wiederholungen erzeugen keine doppelten offenen Meldungen und setzen eine Kenntnisnahme nicht zurück. Inhaltlich geänderte Meldungen werden erneut ungelesen.

Dies sind Meldungen innerhalb der Plattform, kein externer E-Mail- oder Pushversand. Keine automatische Produktänderung oder Ersatzbestellung durch den Administrator.

## API und Schutz

Restaurant-/Lieferantensitzung:

- `GET /api/ai/order-groups`: eigene vollständige Aufträge, bestätigte Termine, Verfügbarkeitsmeldungen und offene Ersatzvorschläge.
- `POST /api/ai/order-groups/:id/accept`: Lieferant, `requestKey` UUID, `confirmed:true`, `deliveryDate`.
- `POST /api/ai/order-groups/:id/receive`: Restaurant, UUID `requestKey`, `confirmed:true`, vollständige `lines:[{orderId,packs}]`, bei Abweichungen `reason`.
- `POST /api/ai/order-groups/:id/cancel`: Teilnehmer, UUID `requestKey`, `confirmed:true`, `reason`; storniert nur noch offene Positionen.
- `POST /api/ai/fulfilment/unavailable`: Lieferant, `orderId`, `reason`, optional `pauseProduct:true`.
- `POST /api/ai/fulfilment/replacement/propose`: Lieferant, `orderId`, `productId`, ganze `packs`, `reason`.
- `POST /api/ai/fulfilment/replacement/approve` oder `/reject`: Restaurant, `proposalId`, `confirmed:true`.

Plattformadministrator:

- `GET /api/ai/admin/fulfilment`: letzte 200 Meldungen, offene/ungelesene zuerst, plus vollständige ungelesene Anzahl.
- `POST /api/ai/admin/fulfilment/acknowledge`: `id` der Meldung.

Gemeinsame Aktionen sperren alle Auftragspositionen und werden atomar gebucht. Dauerhafte Aktionskennungen verhindern doppelten Lagerzugang; gleiche Kennung mit verändertem Inhalt wird abgewiesen. Je Bestellposition ist nur ein offener Ersatzvorschlag zulässig. Es gibt keine Fremdmandanten-Aktionen und keine stille Ersetzung.

Bestehende Einzelaktions- und Lieferanten-API-Annahmen prüfen ebenfalls Nichtlieferbarkeit/offene Ersatzvorschläge. Stornierung schließt diese Vorschläge und Meldungen. Die bestehenden Lieferanten-API-Schlüssel erhalten damit keinen neuen Zugriff auf Restaurantzustimmung oder Wareneingang. Neue Sammelaktionen sind derzeit Sitzungsfunktionen; die Lieferanten-API bleibt für bestehende ERP-Anbindungen positionsweise kompatibel.

## Validierung

Embedded PostgreSQL und JSDOM prüfen Meldung/Lesestatus, Rollen/Mandantentrennung, Sperren auch in bisherigen APIs, Ersatzablehnung und explizite Zustimmung, Angebotsänderungen, gruppenweiten Liefertermin, abweichende Packungen, Null-Lieferung, atomare Fehler, exakt einmaligen Lagerzugang, 2 % auf tatsächlichen Warenwert und dessen Übernahme in eine simulierte Provisionsrechnung. Separater Browserablauf prüft Lieferant → Adminmeldung → Restaurantzustimmung → Liefertermin → Wareneingang. Keine realen Nachrichten oder Abbuchungen in den Tests.

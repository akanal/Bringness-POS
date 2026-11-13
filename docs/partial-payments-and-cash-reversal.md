# Teilzahlungen, direkte Extras und Barstorno

## Bedienung

- Kasse: Im Warenkorb „Extras auswählen“ öffnen, Artikel wählen, aktive Extras übernehmen. Die Auswahl gilt für die gesamte Menge dieser Position. Preis und Name werden angezeigt; der Server prüft Zuordnung, Aktivstatus und Centpreise erneut. Händlerverkauf bleibt separat. Geparkte Einzelhandelsbons erhalten die Auswahl; geänderte Preise werden beim Abschluss erneut geprüft.
- Tisch abrechnen → „Teilzahlungen / Restbetrag“: Artikelmengen, einen Eurobetrag oder den gesamten Restbetrag bar bezahlen. Eine tatsächliche Bargeldannahme ist ausdrücklich zu bestätigen. Unbekannte Zahlungsantworten ausschließlich mit „Zahlung abgleichen“ wiederholen; kein erneutes Kassieren. Bereits bezahlte Positionen sind gesperrt.
- Zahlungsbestätigungen stehen im Teilzahlungsdialog zur Verfügung und können gespeichert werden. Sie enthalten keinen gesonderten Steuer-/Fiskalbeleg. Erst die vollständige Bezahlung einer Bestellung erzeugt ihren Gesamtbeleg mit allen zugehörigen Zahlungen. Ein Tisch wird erst frei, wenn sämtliche offenen Bestellungen ausgeglichen sind.
- Belegarchiv → „Barverkauf stornieren / abgleichen“: Verwaltungs-PIN, Grund und bestätigte Barauszahlung. Es entsteht ein eigener ST-Gegenbeleg. Originalbestellung, Originalbeleg und ursprüngliche Zahlungen bleiben erhalten. Die Barkasse muss geöffnet sein und ausreichenden Sollbestand haben. Lagerbestand wird bewusst nicht automatisch zurückgebucht; tatsächliche Warenrücknahme separat im Lagerablauf erfassen.

## Grenzen

Keine produktive TSE-/DSFinV-K-Aktivierung. Signierte oder anders fiskalisch abgewickelte Originale benötigen die spätere Anbieterintegration. Kartenzahlungen und Kartenrückzahlungen bleiben ohne serverseitig bestätigten Anbieter gesperrt. Ein Browser-Flag ersetzt keine Zahlungsbestätigung.

Teilzahlungen gelten für offene Tischbestellungen mit konsistenten positiven Positionen. Bereits außerhalb dieses Journals vorhandene Zahlungs-/Belegdaten, widersprüchliche Summen und negative Positionen erfordern Abgleich. Nach einer Betragszahlung kann eine Position nur noch teilweise offen sein; für diesen Rest „Betrag“ oder „Restbetrag“ verwenden. Bereits zurückgenommenes/verrechnetes Pfand blockiert das vollständige Barstorno, damit nichts doppelt ausgezahlt wird. Ein vollständiges Barstorno ohne vorherige Pfandrücknahme verbucht die Pfandrückgabe mit.

## Finanzmodell und Schutz

`pos_partial_requests` speichert den vollständigen bestätigten Vorgang, `pos_partial_allocations` ordnet jede Zahlung den ursprünglichen Positionen zu. Tisch-/Bestellungssperren, Datenbanktransaktionen und dieselbe Vorgangskennung verhindern doppelte Zahlung bei Antwortverlust und parallelen Bedienern. Bestehende Gesamtabrechnungs-Replays haben Vorrang; ein neuer Gesamtabrechnungsversuch nach Teilzahlungen verweist auf den Restbetragsdialog.

Das Barstorno legt eine negative, bezahlte Buchhaltungsbestellung `pos_refund` mit Referenz zum Original an. Negative Zahlungszeilen werden nicht erzeugt; die tatsächliche Barauszahlung ist eine verknüpfte Kassenentnahme. `pos_receipt_reversals` erzwingt genau eine Gegenbuchung je Original. Netto-/Steuerwerte werden exakt negiert, auch bei Rundungsgrenzen. Umsatz berücksichtigt den negativen Betrag; die Nachfrageprognose zählt ihn nicht als neue Bestellung. Ein lediglich vorbereiteter Original-TSE-Vorgang wird atomar in reversal_pending geparkt und von einem späteren Signaturworker nicht versehentlich allein signiert. Bereits begonnene oder unklare TSE-Vorgänge blockieren das Barstorno. Alte TSE-Vorbereitung überspringt Gegenbelege, bis der gewählte Anbieter die korrekte Stornointegration bereitstellt.

Prüfungen: `npm test`, `node server/ai-tests/partial-cash.mjs`, `node server/ai-tests/partial-cash-ui.mjs`, bestehende Checkout-/Tisch-/Pfand-/Händlerprüfungen. Mit `SETTLEMENT_TEST_DATABASE_URL` läuft dieselbe Finanzprüfung gegen isoliertes PostgreSQL einschließlich paralleler Bediener. Ausschließlich synthetische Daten; keine produktiven Testumsätze.

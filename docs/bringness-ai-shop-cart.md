# Lieferantenshops und gemeinsamer Warenkorb

Restaurants finden lieferbare Produkte im Bereich Lieferantenshops. Suchtext, Lieferant und Kategorie werden serverseitig gefiltert; der Katalog zeigt 40 Produkte pro Seite. Produktkarten zeigen Packungsinhalt, Nettopreis, Mindestmenge, Liefergebiet und Bedingungen. Lieferanten pflegen Kategorien und optionale PNG/JPG/WebP-Bilder bis 120 KB unter Mein Sortiment. Bilder werden als eingebettete Daten gespeichert, ohne externe Bildanbieter.

Der Warenkorb bleibt für das angemeldete Konto im aktuellen Browser-Tab gespeichert. Er enthält maximal 50 Produkt/Zielzutat-Kombinationen. Die Einkaufsplanung übernimmt nur ausdrücklich ausgewählte Angebote, rundet Fehlmengen auf ganze Packungen und beachtet die Produktmindestmenge. Der Lieferantenmindestwert wird erst über die Summe seiner Positionen geprüft; einzelne Zutaten werden dafür nicht künstlich aufgestockt. Nicht ausgewählte Zutaten werden gezählt. Weder ein Einkaufsplan noch ein gefüllter Warenkorb löst eine Bestellung aus.

## Bestellablauf

1. Zielzutat/Standort, Packungen und Wunschliefertermin wählen.
2. Warenkorb prüfen: aktuelle Preise, Packungsinhalte, Lieferadressen, Lieferbedingungen, Mindestwerte und Netto-Gesamtsumme anzeigen.
3. Bestellung ausdrücklich bestätigen und verbindlich senden.

Der Netto-Warenwert enthält keine vom Lieferanten zusätzlich berechnete Umsatzsteuer oder Lieferkosten. Liefergebiet und Liefertermin bestätigt der Lieferant; keine automatische geografische Lieferzusage. Warenzahlungen erfolgen direkt an den Lieferanten. Die Lieferantenprovision bleibt 200 Basispunkte (2 %) je Bestellposition und wird durch die bestehenden Wareneingangs- und Abrechnungsabläufe erfasst.

## API und Konsistenz

- `POST /api/ai/cart/preview`: Restaurant-Sitzung, 1–50 `lines` mit `productId`, `stockId`, ganzen `packs`, sowie `deliveryDate`. Liefert `quote`, `warnings`, `canOrder`; keine Bestellung.
- `POST /api/ai/cart/checkout`: dieselben Angaben plus unveränderte `quote`, UUID `requestKey`, `confirmed: true`.
- Checkout sperrt den Käufer und liest Angebote/Standorte unter Lesesperren; alle Positionen werden in einer Transaktion angelegt. Fehlende Verfügbarkeit, falsche Zuordnung, fehlende SEPA-Freigabe, geänderte Preise/Packung/Adresse/Bedingungen oder unterschrittene Mindestwerte verhindern den gesamten Checkout.
- Dauerhafter Eintrag in `ai_checkouts` schützt Wiederholungen mit demselben Schlüssel. Veränderte Anfrage mit bereits verwendetem Schlüssel wird abgewiesen.
- `ai_orders.checkout_id` verbindet den gesamten Einkauf. `supplier_order_id` verbindet seine Positionen je Lieferant. Bestehende Lieferanten-API, Annahme, Storno und Wareneingang bleiben positionsweise kompatibel; eine Lieferantenauftragskennung wird in der Oberfläche angezeigt.
- Katalog erweitert um `category`, `offset`, `total`, `suppliers`, `categories`; vorhandene Filter bleiben erhalten. Neue Produktfelder `category`, `image_data` haben leere Standardwerte und unterbrechen bestehende API-Importe nicht.

## Noch nicht enthalten

Öffentlich zugängliche Shops ohne Anmeldung, automatische Warenbezahlung, verbindliche Lieferkosten-/Umsatzsteuerberechnung des Lieferanten, Echtzeit-Reservierung von Lieferantenbeständen, automatische Einkaufsfreigaben/Budgets und Produkt-Ersatzwahl sind gesonderte Erweiterungen. Lieferantenaufträge unterstützen nun gemeinsame Annahme, bestätigte Liefertermine und gemeinsamen finalen Wareneingang. Nichtlieferbarkeit, Ersatzvorschläge und Mindermengen sind in bringness-ai-fulfilment.md beschrieben.

## Validierung

Embedded-PostgreSQL- und JSDOM-Integration prüft Mandantentrennung, gemeinsame Lieferantenmindestwerte, Aufteilung auf zwei Lieferanten, 32-Stück-Packungen, exakte bestehende Provisionsberechnung, vollständige Ablehnung bei Angebotsänderung, dauerhafte Wiederholung ohne Duplikate, Kategorie-/Bildpflege, Katalogseitennavigation, expliziten Browser-Checkout und Einkaufslistenübernahme ohne Bestellanlage. Zahlungsanbieter und SMTP bleiben in diesen Tests simuliert.

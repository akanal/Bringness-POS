# Warenwirtschaft und regelbasierter Assistent

## Neue Bereiche

Restaurantkonten erhalten **Inventur & Verluste**, **Assistent** und **Einkaufsübersicht**. Auf dem Dashboard steht eine Kurzfassung aktiver Hinweise. Plattformadministratoren sehen unter **Überwachung** offene Lieferprobleme nach Lieferant und die Anzahl zuletzt geprüfter Restaurantkonten; konkrete Bestands-/Verbrauchsdaten bleiben im jeweiligen Restaurantkonto.

### Inventur

Zutaten nach Standort auswählen, tatsächliche Mengen eintragen und bis zu 200 gezählte Positionen zusammen bestätigen. Bisheriger Bestand und Zählwert werden im Browser getrennt angezeigt. Während der Zählung eingegangene Verkäufe/Lieferungen/Korrekturen verändern den bisherigen Bestand: Die Buchung wird dann atomar abgewiesen und die Zählung muss nach Neuladen geprüft werden. Keine teilweise Inventurbuchung.

Gezählte Positionen erhalten einen Journalnachweis mit Art, Grund, vorherigem/nachherigem Bestand und Differenz; auch eine unveränderte Zählmenge wird dokumentiert. Mindestbestände werden durch die Zählung nicht verändert. Die bisherige manuelle Bestandskorrektur bleibt verfügbar und erhält ebenfalls Vorher-/Nachherwerte mit Art Korrektur.

### Schwund und Verderb

Eigene Verlustart wählen, Verlustmenge in der Einheit der Lagerzutat und Begründung eingeben. Buchung zieht die Menge relativ vom aktuellen Bestand ab und kann keinen negativen Bestand erzeugen. Vorher-/Nachherwerte und Begründung bleiben erhalten. Alte frei formulierte Korrekturgründe werden nicht rückwirkend als Schwund oder Verderb interpretiert.

Dauerhafte UUID-Buchungskennungen verhindern doppelte Inventur- und Verlustbuchungen. Gleiche Kennung mit anderem Inhalt wird abgewiesen. Fremde Lagerzutaten und Lieferantenkonten haben keinen Zugriff.

### Einkaufsübersicht

Auswertung nach Monat und optional Lieferant: tatsächlicher Netto-Warenwert, Aufträge/Positionen, Produktmengen und durchschnittlicher Warenwert je Einheit. Eine zusätzliche Übersicht vergleicht die letzten zwölf Kalendermonate. Basis sind bestätigte Wareneingänge in der Zeitzone Europe/Berlin. Tatsächliche Liefermengen aus dem gemeinsamen Wareneingang werden berücksichtigt. Gesendete, angenommene und stornierte Positionen sind nicht als Einkauf enthalten.

Dies ist **keine Bankzahlungsübersicht**: zusätzliche Lieferkosten und Umsatzsteuer des Warenlieferanten sind nicht enthalten. Provisionsrechnungen und Werbekosten werden getrennt behandelt.

## Assistent: erste Stufe

Der Assistent ist ein regelbasierter Prüf- und Prognosedienst. Er nutzt ausschließlich die Daten des jeweiligen Restaurantkontos, kein externes Sprachmodell. Keine lernende KI, keine Wetter-/Veranstaltungsdaten und keine autonome Bestellung, Ersatzfreigabe oder Abbuchung.

Hinweise enthalten Begründung, Zahlenbasis und eine passende nächste Ansicht. Zur Kenntnis nehmen löscht oder erledigt den Hinweis nicht. Eine auffällige Lage bleibt sichtbar; bei neuer Datenbasis oder erneutem Auftreten wird die Kenntnisnahme zurückgesetzt. Entfällt der Auslöser, wandert der Hinweis in die erledigte Historie. Keine Behauptung vollständiger Fehler-/Schwund-/Betrugserkennung.

| Regel | Datenbasis / Auslöser |
| --- | --- |
| Mindestbestand | Tatsächlicher Bestand unter dem vom Restaurant gesetzten Mindestwert. Angenommene Lieferungen sind noch kein Lagerbestand. |
| Sieben-Tage-Bedarf | Mindestens sieben unterschiedliche erfasste Verkaufstage innerhalb von 28 Tagen; positiver Netto-Rezeptverbrauch. Durchschnitt über beobachtete Kalendertage seit dem ersten erfassten Verkauf, maximal 28. Sieben Tage Verbrauch über Bestand plus angenommene, nicht als unlieferbar gemeldete Liefermengen. |
| Verbrauchssprung | Mindestens sieben erfasste Tage im vorherigen 21-Tage-Fenster und drei im aktuellen 7-Tage-Fenster. Durchschnittlicher jüngerer Verbrauch mindestens doppelt so hoch wie zuvor. |
| Verluste | Strukturierte Schwund-/Verderbbuchungen innerhalb von 28 Tagen erreichen mindestens 10 % des erfassten Rezeptverbrauchs; ohne Verbrauch mindestens drei Verlustbuchungen. Keine automatische Bewertung alter Freitextkorrekturen. |
| Preissteigerung | Aktuell lieferbarer Produktpreis je Einheit mindestens 10 % über dem letzten eigenen bestätigten Wareneingang. Unterschiedliche Packungsgrößen und tatsächliche Teillieferungen werden normalisiert. |
| Offene Lieferprobleme | Eigener noch offener Auftrag mit gemeldeter Nichtlieferbarkeit. |
| Wiederholte Lieferprobleme | Mindestens drei unterschiedliche eigene Lieferantenaufträge mit Nichtlieferbarkeit oder Mindermenge in den letzten 90 Tagen; Gesamtzahl ebenfalls anzeigen. |

Importierte Verbrauchsrückbuchungen werden gegengerechnet. Prognosen hängen von vollständigen Verkaufs-/Rezeptdaten und gepflegten Beständen ab. Eine geringe Datenmenge erzeugt keine vorgetäuschte belastbare Prognose; Mindestbestandsprüfung funktioniert auch ohne Verkaufsdaten.

## Regelmäßige Prüfung

Nach Betriebsbereitschaft läuft jede Minute ein geschützter Worker. Er nimmt bis zu 20 aktive Restaurantkonten mit ältester/fehlender Prüfung, die seit mindestens fünf Minuten nicht geprüft wurden. Ein PostgreSQL-Advisory-Lock verhindert parallele Worker. Je Konto werden Prüfungen serialisiert. Bei vielen Konten kann ein vollständiger Durchlauf länger als fünf Minuten dauern. Das Öffnen von Assistent/Dashboard prüft das eigene Konto direkt; bei angemeldeten Restaurantkonten werden Zähler etwa jede Minute aktualisiert.

Fehler eines Kontos unterbrechen die übrigen Konten nicht; der nächste Durchlauf oder der nächste Aufruf kann erneut prüfen. Der Dienst schreibt nur Prüfhistorie und Kenntnisnahmen, keine Einkaufs- oder Zahlungsaktionen.

## API

- `GET /api/ai/inventory`: eigene Lagerzutaten und letzte 200 strukturierte Lagerbuchungen.
- `POST /api/ai/inventory/count`: UUID `requestKey`, `confirmed:true`, `reason`, 1–200 `lines:[{stockId,expectedQuantity,countedQuantity}]`.
- `POST /api/ai/inventory/loss`: UUID `requestKey`, `confirmed:true`, `reason`, `stockId`, positive `quantity`, `kind: waste|spoilage`.
- `GET /api/ai/monitor`: eigene aktuelle Hinweise, letzte 50 erledigte Hinweise, Prüfstatus und Datenmengen.
- `POST /api/ai/monitor/acknowledge`: eigene Hinweis-UUID `id`.
- `GET /api/ai/purchases?month=YYYY-MM&supplier=UUID`: private Einkaufswerte und Monatsvergleich.
- `GET /api/ai/admin/monitor`: nur Plattformadministratoren; offene Liefermeldungen nach Lieferant und Anzahl geprüfter Restaurantkonten.

## Validierung

Embedded PostgreSQL prüft atomare Zählung einschließlich Änderung während der Inventur, Mandantentrennung, Arten/Einheiten und Vorher-/Nachherwerte, Bestandsuntergrenze, Duplikatschutz, alle sieben Hinweisarten, zurückgebuchten Verbrauch, normalisierte Packungspreise und tatsächliche Einkaufswerte. Ein Worker-Durchlauf verändert weder Bestellungen noch Provisionszahlungen. JSDOM prüft Restaurantablauf Inventur → Verderb → begründeter Hinweis/Kenntnisnahme → Monatsauswertung und die Admin-Lieferübersicht. Zahlungsanbieter und SMTP bleiben in der Gesamttestfolge simuliert.

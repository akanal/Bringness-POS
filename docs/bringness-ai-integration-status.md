# Bringness AI: Schnittstellen und offene Planung

## Kassenschnittstellen – umgesetzt

| Funktion | Stand |
| --- | --- |
| Bringness POS mit Inhaberfreigabe einem AI-Standort zuordnen | Vorhanden; erneute Prüfung der Freigabe bei Synchronisierung und Produktabruf |
| Bezahlte POS-Verkäufe übernehmen | Alle 15 Sekunden, jeweils bis 200 Bestellungen; Cursor und Ereignis-ID verhindern doppelte Bestandsbuchungen |
| Kassenartikel zu Rezepten zuordnen | Produktliste dauerhaft über „Artikel zuordnen“ erreichbar, fehlende Rezepte sichtbar |
| Externe Kassen und Ketten | Standortgebundene API-Verbindungen; je Standort eigener Schlüssel und Rezepte |
| Verkaufsimport und Rückbuchung | Versionierte API; Ereignis-ID, atomare Rezeptbuchung und gespeicherte Verbrauchsmengen für Rückbuchungen |
| Import vorab prüfen | Testimport ohne Veränderung von Beständen, Verkaufsereignissen oder letzter Sync-Zeit |
| Schlüsselverwaltung | Nur Hash gespeichert; Schlüssel einmal sichtbar; Erneuern macht alten Schlüssel ungültig; Pause sperrt Import |
| Anbindungsdiagnose | Status, letzte erfolgreiche Buchung und Fehler im Arbeitsbereich; API-Status und zugeordnete Artikelcodes |
| Technische Dokumentation | `/ai-api.html` und OpenAPI 3.0.3 unter `/ai-openapi.json` |

API-Zugänge erlauben ausschließlich Verkaufsbuchung, Testimport, Status und zugeordnete Verkaufsartikel ihres Standorts. Sie erlauben keine Bestandskorrektur, keine Einkaufsbestellung und keinen Zugriff auf andere Teilnehmer.

Der bisherige Verkaufsimport unter `/api/ai/import/sales` bleibt verfügbar. Neue Integrationen verwenden `/api/ai/v1/sales`. Mengen müssen JSON-Zahlen sein. 1–100 Positionen je Ereignis, höchstens drei Nachkommastellen, Ereignis- und Artikelcodes maximal 150 Zeichen. Maximal 600 API-Anfragen je Verbindung in 15 Minuten; eine dauerhafte ausgehende Warteschlange mit Wiederholung bei vorübergehenden Fehlern ist Aufgabe des angeschlossenen Kassensystems.

Ein fehlendes Rezept hält den POS-Import an. Nach Korrektur wird dieselbe Bestellung erneut versucht. POS-Stornos werden nicht automatisch als Lagerzugang behandelt: Eine Erstattung allein stellt verbrauchte Zutaten nicht wieder her. Die API unterstützt eine ausdrücklich ausgelöste Rückbuchung des tatsächlich rückgängig gemachten Verbrauchs. API-Verbindungen und direkte POS-Verbindung für dieselbe Verkaufsquelle dürfen nicht parallel importieren.

## Weitere Produktplanung – Implementierung und externe Restpunkte

| Thema | Vorhanden / noch erforderlich |
| --- | --- |
| Lieferantensortimente | CSV und gemeinsamer Barcode-Katalog vorhanden; Lieferanten-API für Sortiment, Nettopreise, Lieferbarkeit, Bestellabruf, Annahme und Stornierung umgesetzt; konkrete ERP-Adapter und Webhooks noch offen |
| Fremdkassen-Adapter | Allgemeine API vorhanden; konkrete Adapter brauchen Herstellerdokumentation und Testzugänge |
| Ketten | Mehrere Standorte und getrennte Verbindungen vorhanden; standortgebundene zentrale Bedarfseinreichung/Freigabe vorhanden (siehe `bringness-ai-regional-planning.md`); feinere Teamrechte und konkrete Kettenadapter bleiben offen |
| Einkaufsvorschläge | Verbrauch, Mindestbestände und offene bestätigte Lieferungen vorhanden; POS-Tagesprognose, rezeptbasierte Vorbereitungsmengen, DWD-MOSMIX und manuelle regionale Termine mit ausdrücklich aktivierten Szenariofaktoren vorhanden; öffentliche Eventfeeds und automatisch gelernte Faktoren bleiben offen |
| Provision | 2 % vom vermittelten Netto-Warenwert in beiden Einführungsmodellen; Zahlungsnachweise, monatliche Abrechnung, unveränderliche Provisionsrechnungen und gesperrt voreingestellter SEPA-Ablauf vorhanden; reale Rechnungssteller-/Mandats-/Anbietereinrichtung und strukturierte E-Rechnung bleiben externe beziehungsweise dokumentierte Restpunkte |
| AI Premium | einmalige 30-tägige Restaurant-Testphase und expliziter Abo-/Tarifwechselablauf implementiert; keine automatische Umwandlung kostenloser Konten, Live-Einzug erst nach vollständiger Freigabe (siehe `ai-subscriptions.md`) |
| Trennung von POS | Eigene AI-Datenbank vorhanden; AI-Server läuft derzeit noch im kombinierten Runtime-Modus und nutzt eine POS-Datenbankbrücke für Inhaberfreigabe und Verkaufsabfrage |

## Prüfung

Die Tests verwenden eingebettetes PostgreSQL (PGlite) und eine Browser-DOM. Geprüft werden vollständiger Rollback, wiederholte Importe, Rückbuchungen aus gespeicherten Effekten, Testimporte, Schlüsselrotation, pausierte Zugänge, Standort-/Kontentrennung, Produktzuordnung und erneute Inhaberfreigabe. Der Test der Oberfläche umfasst Erstellung und Erneuerung von Schlüsseln. Das ersetzt keinen Abnahmetest mit einem echten Fremdkassensystem.

## Lieferanten-API

Händler, Großlieferanten und Hersteller verwalten getrennte, lieferantengebundene API-Schlüssel unter „Lieferanten-API“. Produktimporte aktualisieren anhand einer eindeutigen eigenen Artikelnummer bis zu 100 Produkte pro Anfrage atomar. Import-IDs schützen vor doppelten und verspätet wiederholten Schreibvorgängen. Nicht lieferbare Produkte werden aus Angeboten ausgeschlossen; ihre bestehenden Bestellungen bleiben unverändert. Bestellabruf verwendet einen Cursor mit vollständiger PostgreSQL-Zeitpräzision. Lieferanten dürfen eigene offene Bestellungen annehmen oder stornieren; Wareneingang und Provisionszahlung sind darüber nicht möglich. Die vereinbarten 2 % werden als Bestellsnapshot gespeichert.

Dokumentation: `/ai-supplier-api.html`, OpenAPI: `/ai-supplier-openapi.json`. Verfügbarkeit ist eine Kennzeichnung, keine Mengenreservierung. Bestellabruf liefert aktuelle Zustände, keine vollständige Ereignishistorie. Prüfsuite erweitert um Produktimport, Wiederholung, fehlerhaften Batch, Nichtverfügbarkeit, unveränderte Provision, fremde Lieferantenzugriffe, Bestellaktionen, Schlüsselrotation und Lieferantenoberfläche.

## Grobe Tagesprognose

Standortbezogene POS-Tagesprognose mit Wochentags- und Vorjahresvergleich, Originalzahlungszeit, Stundenständen und groben Vorbereitungsmengen: siehe `bringness-ai-day-forecast.md`. Keine zusätzliche Gästeerfassung. DWD-Wetter und standortbezogene/ausdrücklich freigegebene regionale Termine sind inzwischen angebunden; Szenarioregeln bleiben standardmäßig deaktiviert. Siehe `bringness-ai-regional-planning.md` und `pos-ai-completion.md`.

## Verifizierter Staging-Stand vom 17.10.2026

Die zuvor als offen bezeichneten Wetter-, Beschaffungs-, Offline- und Steuerberaterabläufe
sind auf dem aktuellen Staging-Stand implementiert und separat geprüft. Konkrete
Nachweise und Grenzen stehen in `pos-ai-validation-20261017.md`,
`pos-payment-recovery-20261017.md` und `isolated-preview-runtime.md`. Diese Übersicht
ist kein Nachweis einer produktiven Bereitstellung oder realer Anbieterfreischaltung.
Verschlüsselte Vorschau-Sicherung und unabhängige Rücksicherungsprüfung sind in
`isolated-preview-recovery.md` dokumentiert.

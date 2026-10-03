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

## Weitere Produktplanung – noch offen

| Thema | Vorhanden / noch erforderlich |
| --- | --- |
| Lieferantensortimente | CSV und gemeinsamer Barcode-Katalog vorhanden; Lieferanten-API für Preise, Verfügbarkeit und Bestellübermittlung noch offen |
| Fremdkassen-Adapter | Allgemeine API vorhanden; konkrete Adapter brauchen Herstellerdokumentation und Testzugänge |
| Ketten | Mehrere Standorte und getrennte Verbindungen vorhanden; zentrale Einkaufsfreigaben und feinere Teamrechte noch offen |
| Einkaufsvorschläge | Verbrauch, Mindestbestände und offene bestätigte Lieferungen vorhanden; Wetter- und Veranstaltungsdaten noch nicht angebunden |
| Provision | 2 % vom vermittelten Netto-Warenwert in beiden Einführungsmodellen; Zahlungsnachweise vorhanden, automatische Abbuchung und Provisionsrechnungen noch offen |
| AI Premium | 30 kostenlose Testtage geplant; vollständige Paketfreischaltung und endgültige Preise noch offen |
| Trennung von POS | Eigene AI-Datenbank vorhanden; AI-Server läuft derzeit noch im kombinierten Runtime-Modus und nutzt eine POS-Datenbankbrücke für Inhaberfreigabe und Verkaufsabfrage |

## Prüfung

Die Tests verwenden eingebettetes PostgreSQL (PGlite) und eine Browser-DOM. Geprüft werden vollständiger Rollback, wiederholte Importe, Rückbuchungen aus gespeicherten Effekten, Testimporte, Schlüsselrotation, pausierte Zugänge, Standort-/Kontentrennung, Produktzuordnung und erneute Inhaberfreigabe. Der Test der Oberfläche umfasst Erstellung und Erneuerung von Schlüsseln. Das ersetzt keinen Abnahmetest mit einem echten Fremdkassensystem.

# Wiederbestellung: konkreter nächster Ausbau

Autorisiert am 14.11.2026: Wiederbestellung umsetzen und nach bestandenen Prüfungen über den bestehenden Ablauf veröffentlichen. Ziel: vorhandene Händlerbestellung mit aktuellen Angebotsdaten als überprüfbare neue Auswahl vorbereiten. Keine automatische Bestellung/Zahlung oder unveränderte Preiszusage.

## Befund aus dem aktuellen Quellstand

`shop_market_orders` speichert Ergebnis und Wiederholungskennung, `shop_market_seller_orders` unveränderliche Beleg-/Versandsnapshots. Der Finanzsnapshot enthält keine Angebots-ID; die vorhandene unveränderliche Tabelle `shop_market_allocations` enthält jedoch bereits exakte Angebots-ID/SKU/Menge je Bestellung. Diese vorhandenen Referenzen werden wiederverwendet. SKU allein ist kein eindeutiger artikelübergreifender Schlüssel. Historische Bestellungen ohne solche Referenzen werden nicht geraten.

## Verbindlicher Ablauf

1. Bei künftig angelegten Händlerbestellungen die validierten Angebots-ID/SKU/Menge-Referenzen getrennt vom unveränderlichen Finanzsnapshot mitführen. Beim Speichern sind sie bereits durch den bestehenden Checkout geprüft.
2. In der angemeldeten Käuferbestellansicht „Erneut auswählen“ anbieten, nur wenn eindeutige Referenzen verfügbar sind. Historische Bestellungen ohne Referenzen zeigen stattdessen den vorhandenen Link zum Händlerprofil. Keine rückwirkend geratenen Zuordnungen.
3. Lesende Vorschau ausschließlich für die eigene Käuferfirma und Originalbestellung. Jede Referenz erneut auf veröffentlichte Ware, freigegebenen Händler und exakte Variante prüfen. Gleiche Händlerzuordnung verlangen. Entfernte Varianten ausdrücklich als nicht verfügbar anzeigen; keine automatische Ersatzware.
4. Aktuelle Menge/Bestand, Steuersatz, Preis, Versand/Abholung und Angebotsrevision anzeigen. Ursprüngliche und aktuelle Warenpreise getrennt benennen; Änderungen nicht verstecken. Fehlende Menge nicht automatisch reduzieren.
5. Käufer übernimmt ausdrücklich gültige Positionen in eine neue Auswahl. Vorhandener Warenkorb wird nicht unbemerkt ersetzt. Maximal20 Positionen und999 Stück je Position, bestehende Händlertrennung und Mengenprüfung.
6. Vor dem eigentlichen Bestellen bestehende anonyme Server-Preisprüfung und ausdrückliche Empfänger-/Bestellbestätigung verwenden. Neue Wiederholungskennung für den neuen Auftrag; niemals Kennung der alten Bestellung wiederverwenden. Bestehende ungeklärte Zahlung/Bestellung zuerst abgleichen.
7. Zahlung, Fulfilmentfreigabe, Verträge und LIVE-Schalter bleiben ausschließlich im bestehenden autorisierten Ablauf. Wiederbestellung ist kein Abo.

## Abnahme vor Umsetzung/Veröffentlichung

Mandanten-/Anmeldewechsel; fremde Bestellung; historische Bestellung ohne Referenzen; doppelte SKU in mehreren Angeboten; gelöschte oder neu veröffentlichte Variante; geänderter Händler/Preis/Steuer/Versand; niedriger Bestand; vorhandene Auswahl; verspätete Antworten nach Abbruch; Wiederholungskennung nach Antwortverlust; echte Browserabläufe bei390/768/1280px. Ausschließlich isolierte synthetische Konten und Daten. Kein Produktiv-Testkauf.

## Weiterführender Produktansatz

Die Wiederbestellung schafft eine Grundlage für einen Einkaufsassistenten, der eine regelmäßig benötigte Liste gegen aktuelle eigene Händlerangebote prüft. Eine spätere Optimierung muss Versand pro Händler und ausdrücklich erlaubte Ersatzartikel berücksichtigen. POS-/AI-Bedarfsübernahme bleibt optional und getrennt beauftragt. Keine behauptete Marktneuheit oder garantierte Ersparnis; zuerst messbar weniger Schritte und korrekte aktuelle Gesamtkosten liefern.


## Umsetzung
- Käuferliste liefert ausschließlich nach bestehender Firmen-/Sitzungsprüfung `reorderReferences` aus unveränderlichen Bestandszuordnungen. Verkäuferansicht und Finanzsnapshots bleiben unverändert; keine Migration erforderlich.
- „Erneut auswählen“ öffnet eine lesende Vorschau mit aktuellen öffentlichen Angeboten, Originalgesamtbetrag und aktuellen Bruttopreisen. Fehlende Angebote/Varianten, niedriger Bestand und entfallene Erhaltart sind sichtbar; keine Ersatzware, Mengenreduzierung oder Bestandsreservierung.
- Explizite Übernahme nur in leere Auswahl; vorhandene Auswahl und unbestätigte Bestellübergabe blockieren die Übernahme. Danach bestehende Serverprüfung für Gesamtpreis/Versand und ausdrückliche neue Bestellbestätigung mit neuer Vorgangskennung.
- Konto-/Ansichtswechsel und geschlossene Vorschau verwerfen verspätete Antworten. Keine privaten Bestellinformationen in URL oder dauerhaftem Browserzustand.
- Lokal: 37 fokussierte Prüfungen sowie 734 allgemeine Tests erfolgreich. Vollständige Shop- und native Browserabnahme werden vor Veröffentlichung geprüft.

# Händlerangebote vergleichen

In Händlerangeboten die konkrete Variante wählen und **Zum Vergleich** drücken. Bis zu drei Varianten bleiben beim Wechsel zwischen Suche und Produktdetails im selben Browsertab erhalten. **Angebotsvergleich öffnen** zeigt Verkäufer, Kategorie, Zustand, GTIN, Bruttopreis, Versand und Gesamtpreis. Versand / Abholung umschalten; nicht angebotene Erhaltarten werden ausdrücklich gekennzeichnet.

Jede Spalte gilt für genau ein Stück als getrennte Händlerbestellung. Versand wird je dieser Bestellung berücksichtigt, nicht als gemeinsamer Warenkorb mehrerer Angebote. Keine automatische Gleichwertigkeit unterschiedlicher Artikel oder Varianten behaupten. „Niedrigster geprüfter Gesamtpreis dieser Auswahl“ bezieht sich nur auf erfolgreich geprüfte ausgewählte Varianten, nicht den ganzen Markt.

Beim Öffnen/Aktualisieren werden öffentliche Angebote erneut geladen und die bestehende anonyme, nur lesende `/quote`-Prüfung verwendet. Keine Bestellung, Reservierung oder Zahlung. Veraltete Publikation/Preise, fehlender Bestand oder nicht verfügbare Angebote ergeben keinen bestätigten Gesamtpreis. In sessionStorage stehen nur Angebots-ID und SKU, keine Preise oder Verkäuferprofile. Sichtbarkeits-/Konto-/Seitenwechsel verwirft ausstehende Prüfergebnisse.

## Vergleichsmaßstab (14.11.2026)

- Amazon: Angebot/Verkäufer und Preis gemeinsam betrachten, keine fremden Ranking-/Käuferschutzversprechen übernehmen. https://www.aboutamazon.de/news/amazon-prime-und-shopping/wie-kund-innen-das-beste-angebot-im-amazon-store-auswaehlen-koennen
- OTTO: eigenständige Verkäuferkonditionen und Versand je Verkäufer verständlich machen. https://www.otto.de/shoppages/faqs_otto_marktplatz
- CHECK24: Preis inklusive Versand als Vergleichsgröße. https://preisvergleich.check24.de/ul/lp/agb/
- Alibaba: Produkt-/Lieferantenauswahl gegenüberstellen. https://source.alibaba.com/

Bringness bleibt eine manuell gewählte Gegenüberstellung echter freigegebener eigener Händlerangebote; kein externer Preisabruf, keine erfundenen Bewertungen/Liefergarantien.

## Prüfung

`node --test ops/shop/market-comparison.test.mjs` und vollständige `node ops/shop/run.mjs`. Native Browserabnahme integriert in `ops/shop/marketplace-browser.mjs` über die bestehende PostgreSQL-Produktionsprüfung: anonymes Vergleichen, Versand/Abholung, Wiederherstellung nach Reload, Leeren und 390/768/1280px ohne Seitenüberlauf. Ausschließlich isolierte synthetische Händlerwaren.

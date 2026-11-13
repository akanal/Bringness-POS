# Shop-Verbesserungen und fortlaufender Plattformvergleich

Auftrag vom 13.11.2026: Amazon, Alibaba, CHECK24, OTTO und passende weitere Marktplätze als Maßstab bei künftiger Bringness-Arbeit berücksichtigen. Eigene Gestaltung und vorhandene Regeln erhalten.

| Plattform | Vergleichspunkt | Umsetzung in Bringness |
| --- | --- | --- |
| Amazon | Klare Zuordnung von Verkäufer und Servicekontakt | Öffentliche Produktdetails bündeln Verkäufer, Lieferung/Abholung und Kontakt für Produkt-/Rückgabefragen. Keine zusätzliche Garantie behaupten. |
| Alibaba | Verständliche Produkt-/Varianteninformationen und Vertrauen in den Anbieter | Echte verfügbare Varianten/Bruttopreise anzeigen; bestehende manuelle Händlerfreigabe erhalten. Trade Assurance wird nicht übernommen oder behauptet. |
| CHECK24 | Versandkosten je Händler und nachvollziehbarer Gesamtpreis | Vorhandene anonyme Server-Preisprüfung vor Anmeldung sichtbar erklären; Händlerauswahlen bleiben getrennt. |
| OTTO | Verkäufer, Lieferzeit und Versand vor der Bestellung | Dieselben tatsächlichen Angebotsdaten bereits auf Startseitenkarten zeigen. Rückgabefristen anderer Anbieter nicht als Bringness-Regel kopieren. |

Primäre Quellen, am 13.11.2026 geprüft:
- https://www.aboutamazon.de/news/amazon-prime-und-shopping/wie-bekomme-ich-hilfe-bei-meiner-amazon-bestellung
- https://activity.alibaba.com/page/HowItWorks/Page.html
- https://preisvergleich.check24.de/ul/lp/agb/
- https://www.otto.de/shoppages/faqs_otto_marktplatz

## Umgesetzter Umfang

Die Startseite lädt ausschließlich öffentlich freigegebene Händlerangebote mit verfügbaren Varianten aus dem vorhandenen Marktplatz. Höchstens sechs Karten, nur tatsächliche Bilder aus dem öffentlichen Bildspeicher, Bruttopreise und separate Versandangaben. Keine Anmeldung, Cookies oder Kontodaten für diesen Lesezugriff. Bei leerem, deaktiviertem oder nicht erreichbarem Angebot bleibt die Sektion verborgen. Keine Dummy-Produkte und keine Behauptung eines günstigsten oder besonders empfohlenen Angebots.

Der bestehende Händlerstart wird zu einer Navigation mit fünf überschaubaren Schritten. Konto, Händlerfreigabe, privater Angebotseditor, Kontoentwürfe und Veröffentlichungsprüfung bleiben die vorhandenen maßgeblichen Abläufe. Navigation schreibt nichts, lädt nichts automatisch und setzt keine Prüfung als bestanden. Verdeckte oder noch nicht geladene Editoren werden nicht geöffnet; aktuelle Formulardaten bleiben erhalten.

Produktdetails fassen die vorhandenen öffentlichen Verkäufer- und Lieferdaten zusammen und bieten den tatsächlichen Verkäuferkontakt für Rückgabe-/Reklamationsfragen an. Keine Rückgabefristen, Zertifikate, Bewertungen oder Garantien erfinden.

Die vorhandene öffentliche Server-Preisprüfung liefert weiterhin den Gesamtpreis einschließlich der tatsächlichen Versandkosten. Ohne Anmeldung sind Auswahl und Preisprüfung möglich; statt eines nicht abschließbaren Empfängerformulars erscheint danach der klare Kontoeinstieg. Eine echte Gastbestellung wird nicht aktiviert: Bestellzuordnung, Wiederholungsschutz und derzeitige rechtliche/finanzielle Freigaben setzen das vorhandene Konto voraus. Ein späterer Gastabschluss benötigt einen eigenen vollständigen Vorgangs- und Nachweisweg. Bestehende Zahlungsanbieter-, Vertrags- und LIVE-Schalter bleiben unverändert.

## Prüfungen

`node --test ops/shop/offer-discovery.test.mjs ops/shop/marketplace-connected-ui.test.mjs ops/shop/portal-cards.test.mjs`

Bestehende native Produktionsprüfung erweitert um öffentliche Angebote ohne Konto, Produktdetails und Kostenprüfung vor Anmeldung sowie Händlernavigation bei390/768/1280px. Sämtliche Daten sind synthetisch und verbleiben in isolierten Testdatenbanken. Keine produktiven Verkäufer, Produkte, Bestellungen oder Zahlungen zu Testzwecken anlegen.

# Produktsuche und CSV-Produktimport

Auftrag: Preis-/Kategorie-/Verfügbarkeits-/Erhaltfilter verbessern und CSV-Produktimport vereinfachen. Bestehende Bringness-Gestaltung und Freigaben bleiben erhalten.

## Vergleich als Orientierung

Amazon beschreibt Preis- und Lieferfilter, OTTO Kategorie-/Preis-/Merkmalsfilter; CHECK24 erläutert transparente Filter und Sortierung. Alibaba bietet gebündelten Produktimport. Bringness übernimmt hier einen nachvollziehbaren Bruttopreisbereich sowie lokalen CSV-Import mit Prüfung. Kein KI-Raten von Steuern/Kategorien, keine fremde Garantie oder behauptete vollständige Funktionsgleichheit.

Primäre Quellen am 14.11.2026 geprüft:
- https://www.aboutamazon.de/news/amazon-prime-und-shopping/amazon-lens-hilfreiche-funktionen
- https://www.otto.de/shoppages/nutzungsbedingungen
- https://www.check24.de/unternehmen/ueber-uns/
- https://seller.alibaba.com/pages/producttools/index.html

## Anwendung

Händlerangebote: Preis ab/bis in Euro, inkl. MwSt. pro Variante ohne Versand. Beide Grenzen einschließlich, Komma/Punkt möglich. Der Server filtert vor der Seitenauswahl. Mindestens eine Variante muss in den Bereich passen; bei „Nur verfügbar“ muss genau diese Variante Bestand haben. Die passende Variante wird vorausgewählt. Kategorieauswahl enthält die gesamte vorhandene Taxonomie, auch außerhalb der ersten Ergebnisseite. Kategorie, Versand/Abholung und Verfügbarkeit lösen Suche direkt aus; Preisänderungen mit Filter anwenden. URL/Zurück und Zurücksetzen erhalten den Filterstand nachvollziehbar. Keine Gesamtanzahl oder globale Sortierung aus nur geladenen Ergebnissen ableiten.

Angebote vorbereiten: CSV-Vorlage herunterladen oder eigene CSV auswählen. Semikolon, Komma und Tabulator, UTF-8/BOM, Anführungszeichen und mehrzeilige Beschreibungen werden unterstützt. Spaltenvorschläge sind manuell korrigierbar. Gleiche/fehlende Überschriften und strukturell ungleiche Zeilen werden abgelehnt. Höchstens4MB/200Datenzeilen/40Spalten; insgesamt50 lokale Entwürfe. Nettopreis in EUR; kein geratenes Brutto-/Netto-Konvertieren. Fehlende Steuer bleibt review. Fehlende Art/Zustand/Kategorie/Lieferdaten erzeugen einen Fehler. Allgemeine Angaben lassen sich ausdrücklich als fester Wert für alle Zeilen setzen, ohne die Datei zu bearbeiten. Jede Änderung dieser Werte verwirft ebenfalls die Auswahl.

Die Vorschau führt keinen Upload aus. Zuordnungsänderungen leeren jede Auswahl. Bestehende Duplikathinweise, Einzel-/Sammelauswahl, Bestätigung und unveränderte Kennungserzeugung des lokalen Importwegs bleiben maßgeblich. Bestehende Entwürfe und geöffnetes Formular werden nicht überschrieben. Kontospeicherung, Händlerprüfung und öffentliche Veröffentlichung erfolgen anschließend ausdrücklich im bestehenden Ablauf. Keine produktiven Testartikel anlegen.

## Prüfung

`node --test ops/shop/offer-csv.test.mjs ops/shop/offer-import-ui.test.mjs ops/shop/marketplace-connected.test.mjs ops/shop/marketplace-connected-ui.test.mjs`

`node ops/shop/run.mjs`

Native Produktionsprüfung: tatsächlicher CSV-Dateiupload, automatische/manuelle Zuordnung, verworfene Auswahl, bestätigte Übernahme; öffentlicher Preisfilter mit echten PostgreSQL-Abfragen und Reset bei390/768/1280px. Nur isolierte synthetische Daten.

## Verifiziert veröffentlicht

PR313, Featurekopf7ae3fbcf42bb746c685407613e377309167f69a9, Quellbaumc2e86c4f6bfdbc6240b57ec3728e0b054791f4af. 836 lokale Shoptests ohne Fehler/Skip; alle fünf finalen PR-Workflows erfolgreich: Checks43570705584, Release43570705627, isolierte Vorschau43570705626, POS/AI43570705593 und Shop43570705583/job132374244971. Native PostgreSQL-/Browserprüfung einschließlich CSV-Dateiupload, expliziten allgemeinen Angaben, Zuordnungsänderung/Auswahlreset, bestätigter lokaler Übernahme sowie Preisbereich/Reset bei390/768/1280px bestanden. Finale mobile Ansichten aus Artefakt14104369024 visuell geprüft.

Merge1b20e4ebaf92190ad4f7e20a48fc3845f4a49e84 über Netcup43571363676/job132376293539 erfolgreich veröffentlicht. Authentifiziertes Protokoll bestätigt exakt diese Revision sowie beibehaltenen vorherigen Container und Datenbanksicherung. Live sieben JavaScript-/CSS-Dateien bytegleich; Händlerangebots-/Verkäuferseiten200 mit Preisfeldern/CSV-Einstieg; health200/database:ok. Öffentliche kombinierte Preis-/Verfügbarkeitsabfrage200, umgekehrter Bereich400/INVALID_MARKET_INPUT; Zusatz-Anmeldezeile bleibt entfernt. Zum Abnahmezeitpunkt0 öffentliche verfügbare Angebote. Keine produktiven Testartikel, Kundenbestellungen, Zahlungs- oder Kontodaten angelegt/geändert.

Nächster empfohlener eigenständiger Ausbau: echte Händlerangebote nebeneinander mit Produktpreis, Versand-/Abholbedingungen und Verkäuferdaten vergleichen. Noch nicht durch dieses Paket implementiert.

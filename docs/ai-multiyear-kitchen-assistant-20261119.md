# Mehrjähriges Lernen und optionale Küchenempfehlungen

Der Eigentümer verlangt jahrelange Beobachtung, Prognosen und nützliche Restaurantfunktionen. Verderbvermeidung und Vorbereitung werden unabhängig pro Standort ein-/ausgeschaltet, beide zunächst aus. Die Historie bleibt beim Ausschalten erhalten. Diese Umsetzung baut auf dem Entwurf ai-long-term-learning-20261118.md auf.

## Laufzeitverhalten

- Vier additive Historientabellen halten tägliche Mengen/Umsätze, tatsächliche Artikelmengen nach Zahlungsstunde, bereits gespeicherte standortbezogene Verbrauchseffekte, Änderungsrevisionen und originale Prognosen. Keine Löschung oder feste Jahresgrenze. Quellenkohorte umfasst aktive autorisierte POS-Betriebe/Inhaber; andere Kohorten werden nicht zum Training zusammengeführt. Verbrauchseffekte dokumentieren den AI-Standort, nicht rückwirkend rekonstruierte Rezepte.
- Pro Standort höchstens alle55Minuten ein93Tage-Fenster plus14jüngste abgeschlossene Tage, später zyklische Nachprüfung älterer Fenster. Historischer Erstimport kann mehrere Stunden/Tage brauchen. Sichtbarer Fortschritt; bereits vorhandene jüngste Daten werden parallel erfasst. Getrennte AI-/POS-Transaktionen halten Konto-, Standort-, Bindungs- und Quellenfreigaben bis zum AI-Commit; beschränkte Sperr-/Abfragezeiten. Bei gesperrter Quelle kein historischer Ersatz aus fremden Konten.
- Tag ohne Verkaufsdatensatz bleibt unbekannt, außer bei belegtem Schließtag. Keine Nullnachfrage aus fehlenden Daten erfinden. Tatsächliche Verkäufe behalten Vorrang vor einem widersprechenden Schließtag. Spätere Änderungen erzeugen Revisionen und eigenen Kenntniszeitpunkt.
- Mehrjährige gleiche Wochentage im Saisonumfeld±21Tage mit Altersgewicht; jüngste achtWochen begrenzen das Gesamtgewicht alter Saisons. Umsätze separat, jüngere Umsatzbasis bevorzugt, Mengen niemals aus Preissteigerung ableiten. Grobe Spannen, keine kalibrierte Wahrscheinlichkeit oder Feiertagsverschiebungserkennung.
- Vergleichsbeginn unter Planung & Termine für Konzeptwechsel; erkennbare Änderung vorhandener Koordinaten startet Vergleich ab heute. Historie bleibt erhalten. Wetter-/Terminsignatur bindet die Prüfung an aktuelle Quellen/Regeln/Standort; fehlende Daten bleiben unbekannt.
- Unveränderliche Prognosen je Ausgabe-/Zieldatum und Vorlauf0–6, nur tatsächlich zur Ausgabezeit berechenbare Werte. Tagesprognose nur früh ohne Verkäufe als Lernbeispiel. Neue Modellversion wird nicht mit alten Baselines vermischt. Mindestens42 geeignete abgeschlossene Tage, mindestens28Training/14Prüfung, zeitliche Trennung und nur vor Prüfbeginn bekannte Trainings-Istwerte. Mindestens5%MAE-Gewinn und jüngere Prüfhälfte nicht schlechter, maximal±25%, ersetzt Szenariokorrektur. Korrigierte alte Istwerte werden konservativ verworfen, wenn sie damals noch nicht bekannt waren. Historischer POS-Import erzeugt keine nachträglichen Prognosepaare: es kann zunächst genug Saisondaten, aber noch keine belastbare Wetterlernkorrektur geben.

## Restaurantbedienung

Unter Küchenverbrauch erscheinen Standortwahl und zwei unabhängig gespeicherte Schalter. Optimistische Versionsprüfung verhindert Überschreiben gleichzeitig geänderter Einstellungen. Ausschalten wird im Backend durchgesetzt; ein Abruf berechnet bei ausgeschalteter Vorbereitung keine Prognose. Ein nachträglich gewonnener Ausschaltvorgang wird vor Antwort nochmals gelesen.

Chargenangaben erfassen Zutat, Bezeichnung, geprüfte Restmenge, MHD/Verbrauchsdatum, explizit unbekannt/ungeöffnet/geöffnet, Anbruchdatum und manuell hinterlegtes Datum nach Anbruch. Mengen nur bis zum vorhandenen physischen Bestand, Summe der Chargen geprüft; kein Wareneingang/Abgang durch Speichern. Menge0 erledigt eine Charge ohne Löschung. Wiederholte Anlage derselben Kennung und veraltete Bearbeitung409, keine zweite Charge. Einzelansicht begrenzt auf2000Chargen, sonst expliziter Fehler.

Verderbhinweise unterscheiden fehlende Angaben, erneut zu prüfende Mengen, überschrittene und in zweiTagen fällige Daten. Datum nach Anbruch wird nicht erfunden; leere Anbruchfelder bedeuten ohne ausdrücklich bestätigten Zustand nicht ungeöffnet. Andere Bestandsmenge, neue Lagerbewegung (auch bei gleichem Nettobestand) oder anderer Kalendertag verlangt neue Prüfung. Rezeptideen nur mit vollständig datierten, heute abgeglichenen Zutatenmengen ohne überschrittene Daten und mindestens einer bald fälligen Zutat. Keine Zusicherung der Lebensmittelsicherheit; manuelle Kennzeichnung/Zustandsprüfung bleibt notwendig. Nicht automatisch zugeordnete Verkäufe/Wareneingänge werden nicht als verlässliche Chargenfortschreibung ausgegeben.

Vorbereitung verwendet mindestens drei archivierte Artikel-Verkaufstage je Vergleich, tägliche Medianmengen und den begrenzten Gesamtprognosefaktor. Rezeptmengen sind aktuelle Planrezepte. Tagesmengen werden ganzzahlig aufgerundet. Vor/ab17Uhr werden aus gespeicherter Zahlungsstunde geschätzt und ergeben zusammen den Tageswert; fehlen Stunden, bleibt die Aufteilung unbekannt. Kein tatsächlicher Küchenproduktionszeitpunkt, kein Anschluss an Reservierungen, keine bereits vorbereiteten Portionen oder Resttagesberechnung. Reservierungsanbindung/regelbare Servicefenster bleiben späterer eigener Block.

Die Funktionen erzeugen keine Bestellung, Zahlung, Preisänderung, automatische Lagerbewegung oder Personalzuweisung. Bestehende Beschaffungsregeln/-budgets bleiben getrennt.

## Technische Nachweise

- Lokale allgemeine Suite:770Tests erfolgreich, keine Fehler/Skips.
- Gezielt: Mehrjahreszeiten/Jahreswechsel/Schaltjahr/Sommerzeit, Preis-/Mengentrennung, Kenntniszeit, fehlende Chargen/Anbruchdaten und echte Artikelmengen.
- Zwei getrennte PGlite-Datenbanken: fünfJahre Originalverkaufsdaten, begrenzte Fortschreibung, unbekannt/geschlossen, verspätete Revision, unveränderliche Vorlaufprognose, Quellenentzug, Mandantentrennung, getrennte Schalter, Konflikte und Bestand unverändert.
- Vollständiger bestehender AI-HTTP-/DOM-Ablauf erfolgreich; ergänzt reale Prognosezusammensetzung über vierSaisons, sechs eingefrorene Folgetage, Konzeptdatum und beide Schalter über tatsächliche Browser-Formulare.
- Nativer PostgreSQL-Lauf im POS/AI-Workflow und vor Netcup-Deployment erforderlich: gleiche Datenfälle, konkurrierende Schalteränderung und wartender Quellenentzug. CI-/Liveergebnis erst nach Abschluss ergänzen. Synthetische Fälle belegen kein bereits trainiertes echtes Restaurantmodell.

## Veröffentlichung

Noch nicht veröffentlicht. Lokaler Stand und technische Prüfungen sind kein Live-Nachweis. Nach erfolgreichen erforderlichen CI-Prüfungen bestehendes AI-Deploy mit Sicherung und Rückfall, danach tatsächliche Auslieferung/Health sowie anonyme401-Sperre der neuen privaten API prüfen. Praktische Betreiberabnahme bleibt wie vereinbart später; keine Testdaten im echten Betrieb anlegen.

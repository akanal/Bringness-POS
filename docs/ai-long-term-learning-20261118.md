# Mehrjähriges Lernen in Bringness AI

Stand: 18.11.2026. Architekturentwurf und verbindliche Zielanforderung, noch keine neue Laufzeitfunktion.

## Ziel des Eigentümers

Die Lernfunktion soll einen Betrieb über Jahre beobachten und wiederkehrende Entwicklungen erkennen können. Die Sechs-Tage-Vorschau ist ein Planungshorizont, keine Grenze für die Lernhistorie. Mehrjährige Beobachtung bedeutet auch keine behauptete tagesgenaue Wetter- oder Umsatzvorhersage Jahre im Voraus.

Die bisherige Empfehlung wird entsprechend erweitert: zuerst die langfristige Datengrundlage und Jahres-/Saisonvergleiche, darauf aufbauend die lernende Mehrtagesplanung. Der praktische Inhabertest bleibt verschoben.

## Tatsächlicher Ausgangspunkt

Die heutige Implementierung liest für die Verkaufsprognose höchstens 400 Tage POS-Umsätze und für die Lernkorrektur höchstens 180 Tage früher gespeicherte Prognosen. Die Übersicht begrenzt sich auf 400 Tagesstände. Die aktuelle Tageskorrektur benötigt mindestens 42 geeignete Tage; das belegt keine Jahres- oder Saisonwirkung.

Diese Auswertefenster sind keine nachgewiesenen Löschfristen. Eine Verlängerung einzelner SQL-Zeiträume allein erzeugt noch kein belastbares mehrjähriges Lernsystem. Alte Wetterlagen, Öffnungszeiten, Rezeptmengen und damalige Prognosen sind nur verwendbar, soweit sie tatsächlich belegt sind.

Quellen im aktuellen Repository: server/ai-forecast.js, server/ai-forecast-core.js, server/ai-forecast-learning.js und docs/ai-events-learning-20261118.md.

## 1. Langzeitgedächtnis und Datenqualität

Pro Konto, Standort und berechtigter Verkaufsquelle sollen tägliche, dauerhaft auswertbare Betriebsstände gesammelt werden. Ein kurzes Modellfenster darf diese Historie nicht automatisch löschen. Vorhandene Zugriffs-, Eigentums- und Löschabläufe bleiben zu beachten; finanzielle Originalbelege und aggregierte Lerndaten sind unterschiedliche Datenbestände.

| Beobachtung | Erforderliche Einordnung |
| --- | --- |
| Bezahlte Verkäufe, Stückmengen und Umsatz | Ursprünglicher Verkaufstag, getrennte Mengen- und Preisentwicklung, korrigierte tatsächliche Werte |
| Rezeptverbrauch und tatsächliche Rückbuchungen | Damals gespeicherte Mengen/Effekte; keine Rekonstruktion mit heutigen Rezepten |
| Bestand, bestätigte Lieferungen und Verluste | Als eigener Kontext; Warenzugang oder Inventurdifferenz nicht als Verkauf zählen |
| Öffnungs-/Ruhetage, Ausfälle und Verfügbarkeiten | Bestätigter Nullverkauf, geschlossener Tag und fehlende Daten müssen unterscheidbar bleiben |
| Wetter, Feiertage und Veranstaltungen | Quelle, Gültigkeit, damaliger Kenntnisstand und spätere Korrekturen; unbekannte Werte bleiben unbekannt |
| Sortiment, Preise, Rezepturen, Standort und Anbindungen | Wirksamkeitszeiträume und Herkunft, damit grundlegend veränderte Betriebe nicht ungeprüft gleichgesetzt werden |

Historische POS-Verkäufe dürfen nach einer aktuellen Berechtigungsprüfung ausgewertet werden. Das erfindet keine früheren Prognosen, Wetterbeobachtungen oder Veranstaltungskenntnisse. Bereits gespeicherte originale Verbrauchseffekte dürfen verwendet werden; fehlende alte Rezeptstände bleiben als Lücke sichtbar. Backfills dürfen keine zweite Bestandsbuchung auslösen.

Die Einheiten und Datumsgrenzen bleiben eindeutig. Tageszuordnung folgt dem Betriebsmodell, aktuell Europe/Berlin; Sommerzeitwechsel sind keine doppelten oder verlorenen Verkaufstage. Verspätete Imports und echte Korrekturen aktualisieren den tatsächlichen Datenstand mit Revision und Herkunft, nicht die damals festgehaltene Prognose.

## 2. Beobachtung, Prognose und späteres Ergebnis trennen

Drei Zeitpunkte müssen unterscheidbar sein: wann ein Ereignis stattfand, wann Bringness es kannte und wann eine Prognose erstellt wurde. Eine damalige Wettervorhersage ist keine bestätigte Wetterbeobachtung.

Frühere Prognosen bleiben unverändert und enthalten ihre damalige Datenbasis, Modellversion, Einstellungen und Vorlaufzeit. Später werden sie mit den inzwischen verfügbaren tatsächlichen Verkäufen verglichen. Nachträglich ergänzte Informationen dürfen eine rückblickende Qualitätsprüfung nicht künstlich verbessern.

Für die Mehrtagesplanung werden Vorlaufzeiten getrennt erfasst: morgen, in zwei Tagen bis in sechs Tagen. Ein gutes heutiges Modell ist nicht automatisch ein belegtes Modell für sechs Tage Vorlauf.

## 3. Mehrjährige Muster und aktuelle Veränderungen verbinden

Die Auswertung kombiniert unterschiedliche Sichtweisen:

- Aktuelle Wochen zeigen kurzfristige Veränderungen.
- Vergleichbare Wochentage berücksichtigen den üblichen Betriebsrhythmus.
- Passende Zeiträume früherer Jahre zeigen mögliche Saisonmuster.
- Feiertage, Ferien und verifiziert wiederkehrende Veranstaltungen bilden gesonderte Kontexte.
- Änderungen von Sortiment, Preisniveau, Öffnung und Standort werden zeitlich berücksichtigt.

Mengenentwicklung und Umsatzentwicklung werden getrennt betrachtet. Ein höherer Umsatz durch höhere Preise darf nicht als entsprechend höherer Zutatenverbrauch gelernt werden. Ein ausgefallener Artikel beweist keine dauerhaft geringere Nachfrage.

Ältere Jahre werden nicht ungeprüft gleich stark gewichtet. Eine Standortverlegung oder ein grundlegender Konzeptwechsel bildet einen neuen Vergleichskontext. Die Historie bleibt nachvollziehbar, unpassende Daten werden aber nicht einfach in dieselbe Berechnung gemischt. Die konkrete Gewichtung ist durch zeitlich saubere Vergleiche zu begründen.

Die mehrjährige Architektur muss neue Betriebe mit wenig Daten ebenfalls korrekt behandeln: vorhandene Erfahrungsregeln und neutrale Schätzungen bleiben nutzbar; Jahresmuster werden erst ausgewiesen, wenn entsprechende Vergleichsperioden wirklich vorliegen.

## 4. Nachweisbare Qualität

Die Prüfung erfolgt zeitlich vorwärts: mit damals verfügbaren Daten lernen, die nachfolgenden Tage vorhersagen und erst danach mit dem tatsächlichen Verlauf vergleichen. Vergleichs- und Prüftage dürfen nicht als versteckte Trainingsdaten wiederverwendet werden.

Ausgewiesen werden verfügbare Jahre und Jahreszeiten, geeignete Vergleichstage, Datenlücken, Prognoseabstände und gemessene Abweichungen. Mehr Datenjahre allein sind kein Genauigkeitsversprechen. Wetter-/Terminzusammenhänge bleiben statistische Zusammenhänge, keine bewiesenen Ursachen.

Neue Modellvarianten werden gegen die bestehende Berechnung und einfache Wochentags-/Saisonbaselines geprüft. Begrenzungen und bestehende Aktivierungsregeln werden nicht allein wegen einer größeren Historie aufgehoben. Die heutige 42-Tage-/5%-Regel darf nicht pauschal als Beleg für belastbare Jahresmodelle ausgegeben werden.

## 5. Nutzung für Vorbereitung und Einkauf

Mehrjährige Muster verbessern zunächst Prognosen und nachvollziehbare Vorschläge. Zutatenbedarf wird mit tatsächlichen Rezeptständen, vorhandenen Beständen und rechtzeitig bestätigten Lieferungen verbunden. Angebotsprüfung, Liefertermin, ganze Packungen, Mindestbestellwerte und vorhandene Einkaufsfreigaben bleiben maßgeblich.

Historisches Lernen führt nicht automatisch zu Bestellungen, Zahlungen, Personaländerungen oder Änderungen von Produktpreisen. Die vorhandenen gesonderten Betriebsfreigaben bleiben erhalten. Ein längerer Beobachtungszeitraum ist auch kein größerer freigegebener Bestellhorizont.

## Umsetzung in zusammenhängenden Schritten

1. Datenmodell, Herkunft, Berechtigungsbindung und Qualitätskennzeichen für die Langzeithistorie ergänzen.
2. Wiederholbare tägliche Fortschreibung und kontrollierte historische Übernahme vorhandener Originaldaten aufbauen; keine neuen Lagerbewegungen durch Analytik.
3. Mehrjährige Saison-/Wochentagsvergleiche und zeitlich getrennte Modellprüfung implementieren.
4. Die vorhandene Mehrtagesvorschau mit gesonderten Prognoseständen je Vorlaufzeit erweitern.
5. Zutatenbedarf und Einkaufsvorschläge daran anbinden; Oberfläche zeigt Datenumfang, Lücken und gemessene Qualität.
6. Technische Prüfungen mit mehreren synthetischen Jahren, Schaltjahren, Sommerzeit, verspäteten Korrekturen, Konzeptwechseln und fremden Konten; danach nach bestehendem Verfahren veröffentlichen.

Diese Reihenfolge konkretisiert die Entwicklungsanforderung. Sie ist kein Nachweis bereits gebauter mehrjähriger Modelle, zusätzlicher Wetter-/Feiertagsfeeds oder eines bereits trainierten echten Restaurantmodells. Konkrete Lieferantenadapter bleiben ein separater späterer Block mit tatsächlicher Schnittstellendokumentation und Testzugang.

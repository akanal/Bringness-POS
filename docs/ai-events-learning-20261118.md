# Öffentliche Berliner Termine und geprüfte Lernkorrekturen

## Verhalten

Unter **Bringness AI → Planung & Termine** erscheinen zusätzlich öffentliche
Veranstaltungen aus kulturdaten.berlin, sobald Standortkoordinaten hinterlegt sind.
Die vorhandenen privaten/regional geteilten Termine bleiben erhalten. Die Quelle
deckt Berlin ab, keine vollständige Deutschland- oder Veranstaltungsabdeckung.

Die Serverabfrage verwendet ausschließlich ein gemeinsames Datumsfenster und
Seitennummern. Konten, Restaurantkoordinaten, Verkaufszahlen und Adressen werden
nicht an die Quelle geschickt. Es gibt keinen zusätzlichen API-Schlüssel oder
kostenpflichtigen Dienst. Quellenlinks und Abrufzeit sind sichtbar. Die Quelle
liefert häufig keine genauen Veranstaltungskoordinaten; dann dient die vorhandene
GeoNames-PLZ-Mitte als ausdrücklich gekennzeichnete Entfernungsnäherung. Fehlende
oder ungültige Orte werden nicht geraten.

Abrufe sind auf maximal 12 Orts-/24 Terminseiten à 500 Einträge, 2 MB pro Antwort,
16 MB insgesamt und 45 Sekunden begrenzt; höchstens vier weitere Seiten gleichzeitig.
Ein prozessweiter gemeinsamer Lauf verhindert Abrufe je Konto. Erfolgreiche Antworten
werden eine Stunde, Fehler fünf Minuten gehalten; Tageswechsel verwirft den Cache.
Fehler liefern keine veralteten Termine als aktuell. In der isolierten Vorschau
ist die externe Abfrage abgeschaltet. Die normale vorhandene Wetterabfrage bleibt
unverändert.

Die reale Quelle sortiert nach Beginn ohne eindeutigen Tie-Breaker; Seiten können
überlappen. Gleiche Quellkennungen werden zusammengeführt, die neuere Quellversion
gewinnt, und die mögliche Unvollständigkeit wird angezeigt. Höchstens 1.000 Termine
werden im Planungskontext ausgegeben, eigene Termine haben Vorrang. Auch diese
Begrenzung ist ausdrücklich als unvollständige Abdeckung markiert.

Absagen und Verschiebungen sind inaktiv. Mehrere Veranstaltungsorte behalten ihre
eigene stabile Ortskennung; die bestehende Termineinwirkung gilt weiterhin einmal
pro Tag. Ganztägige/fehlende Endzeiten sind gekennzeichnete Tagesnäherungen.
Nicht existente oder mehrdeutige Berliner DST-Ortszeiten werden ausgeschlossen.

**Öffentliche Berliner Termine in den eigenen Prognoseregeln berücksichtigen** ist
eine neue, standardmäßig deaktivierte Standortwahl. Die bloße Anzeige verändert
keine vorhandenen freigegebenen Einkaufsregeln. Bestehende API-Aufrufer, die das
neue Feld nicht senden, behalten die gespeicherte Wahl. Standort-/Restaurantrechte
werden beim Speichern innerhalb der Transaktion erneut geprüft.

## Lernen

Stündliche unveränderliche Prognosesnapshots speichern zusätzlich die neutrale
Bestellprognose und den damals tatsächlich bekannten Wetter-/Terminkontext.
Vergangene Kontexte werden nicht nachträglich aus heutigen Veranstaltungsdaten
rekonstruiert. Fehlendes/partielles Wetter ist unbekannt, kein trockener/kühler Tag.
Eine unvollständige öffentliche Quelle beweist nicht die Abwesenheit von Terminen.

Die heutige Beratung kann optional eine standortbezogene Ridge-Regressionskorrektur
auf logarithmische Prognosefehler verwenden. Grundlage sind mindestens 42 geeignete
abgeschlossene Tage aus höchstens 180 Tagen, pro Tag die erste geeignete Prognose
bis 09 Uhr vor dem ersten Verkauf. Bei dünner Basis bleibt die bisherige Prognose
unverändert. 42 Kalendertage garantieren daher noch keine ausreichende Lernbasis.
Fehlende Verkaufsdaten werden weiterhin nicht als bestätigter Nullumsatz behandelt.

Die ersten zwei Drittel trainieren; das letzte Drittel bleibt zur chronologischen
Prüfung zurückgehalten. Die mittlere absolute Bestellabweichung muss mindestens 5 %+besser sein, und auch die jüngste Hälfte der Prüftage darf nicht schlechter sein.
Wärme-/Regen-/Terminkoeffizienten erfordern jeweils mindestens acht Tage mit und
acht ohne das Merkmal im Training. Es sind statistische Zusammenhänge, kein Beweis
für Wetterkausalität. Frühe Prognosen enthalten bereits ihre Wochentagsbasis.

Koordinaten, Umkreis, Wetterstation, Schwellen, öffentliche Terminwahl und die
konkreten POS-Verkaufsquellen gehören zum Lernkontext. Nach deren Änderung werden
unpassende frühere Kontexte nicht übernommen. JSONB-Schlüsselreihenfolge ist für
die Kontextgleichheit bedeutungslos. Konten und Standorte bleiben getrennt.

**Historisch geprüfte Lernkorrektur für die heutige Beratung verwenden** ist ebenfalls
standardmäßig aus. Ein ausreichend geprüftes Modell ersetzt die manuellen
Szenariofaktoren der heutigen Prognose; beide werden nie aufaddiert. Die Korrektur
bleibt auf ±25 % begrenzt und nimmt mit dem Tagesfortschritt ab. Tatsächlich schon
gebuchte Verkäufe bilden weiterhin die Untergrenze. Die heutigen Mengenhinweise
folgen dem Faktor. Die sechs Folgetage und die automatische Beschaffung verwenden
weiterhin ihre bestehenden ausdrücklich freigegebenen Szenarioregeln, keine
unbemerkt neu trainierten Bestellfaktoren.

## Quellen und technische Prüfung

- [Offizieller Anbieter](https://www.kulturdaten.berlin/)
- [Offizielle API-Einführung](https://kulturdaten.readme.io/reference/introduction)
- [Offizielle OpenAPI-Spezifikation](https://github.com/technologiestiftung/kulturdaten-api/blob/main/src/schemas/kulturdaten.berlin.openapi.generated.yml)
- [Quellcode der Seitensortierung](https://github.com/technologiestiftung/kulturdaten-api/blob/main/src/resources/events/repositories/MongoDBEventsRepository.ts)
- [GeoNames-Referenz und Lizenz](../server/data/README.md)

Der echte rein lesende Abruf am 19.11.2026 UTC lieferte 2.085 normalisierte
öffentliche Vorkommen im 10-km-Testumkreis um 52.52/13.405. Die Überlappung der
Quellseiten wurde korrekt als teilweise Abdeckung markiert. Keine Anbieterdaten
wurden verändert und kein Testkonto im Produktivsystem angelegt.

Lokale Prüfung: vollständige Unit-Suite sowie bestehende AI-HTTP-/PGlite-/DOM-
Integration mit zusätzlichen Fällen zu Opt-in/Persistenz, fremdem Standort,
ungültigen Booleschen Werten, echtem JSONB-Lernkontext, Anzeige und Speicherung.
Reine Modelltests prüfen zurückgehaltene Tage, fehlende Daten, UTC/Berlin-DST,
Duplikate, Kontextwechsel und niemals addierte Szenario-/Lernwirkung.
Reale Beschaffung oder eine nachgewiesene Modellverbesserung eines echten
Restaurantkontos folgt daraus nicht. Die praktische Inhaberabnahme bleibt später.

Commit, PR-Prüfungen und tatsächliches Deployment sind im anschließenden
Projektübergabeeintrag gesondert zu dokumentieren.

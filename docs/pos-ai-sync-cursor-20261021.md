# POS-AI-Verknüpfung: präziser, monotoner Verkaufsfortschritt

Entwicklungsstand; weitere Funktionsprüfungen auf Wunsch des Inhabers vorgemerkt. Keine Veröffentlichung.

## Konkrete Lücke

Der laufende Verkaufsimport verwendet eine Kombination aus Zahlungszeitpunkt und Auftrags-ID. PostgreSQL speichert Mikrosekunden, die normale JavaScript-Date-Rückgabe des PostgreSQL-Treibers jedoch nur Millisekunden. Sowohl beim Einlesen des gespeicherten Fortschritts als auch beim Speichern nach einer übernommenen Bestellung konnte Präzision verloren gehen. Viele Abschlüsse innerhalb derselben Millisekunde konnten dadurch wiederholt dieselbe Seite belegen und spätere Abschlüsse verzögern.

Der Import liest nun zusätzlich einen UTC-Text mit sechs Nachkommastellen direkt aus PostgreSQL und verwendet diesen unverändert für Seitengrenze und Fortschritt. Der eigentliche Ereigniszeitpunkt bleibt in der bisher verwendeten ISO-/Millisekundenform, damit bestehende Ereigniskennungen/Fingerprints und bereits bestätigte Wiederholungen kompatibel bleiben.

Der Fortschritt wird außerdem nur vorwärts gesetzt. Ein langsamer paralleler Worker kann einen inzwischen weiter fortgeschrittenen Import nicht zurücksetzen. Ein fehlendes Rezept oder ein fehlgeschlagener Lagerimport hält die betreffende Verarbeitung weiterhin vor dem Fortschrittsupdate an.

## Bestehende Buchungsregeln erhalten

- Bezahlte POS-Aufträge verwenden weiterhin `pos:<Auftrags-ID>` als Ereigniskennung.
- Verspätet importierte Offline-Verkäufe bleiben in der dauerhaften Offline-Lagerwarteschlange und verwenden dieselbe Kennung wie der reguläre Verkaufsimport. Ein bereits bestätigter AI-Import darf dadurch keine zweite Lagerbewegung erhalten.
- Im Lebenszyklusmodus reserviert Annahme; Zubereitungsstart verbraucht den gespeicherten Zutatensnapshot. Storno vor Zubereitung gibt Reservierungen frei. Nach Zubereitung gibt es keine automatisch erfundene Warenrückgabe, auch nicht durch eine reine finanzielle Erstattung.
- Inhaberfreigabe, aktives Konto, Verbindung, Betriebs-/Standortbindung, Originalverkaufszeit und gespeicherte Belege bleiben maßgeblich. Keine neue Beschaffung oder Zahlung.

## Gemeinsame spätere Abnahme: T04/T12

Mehr als 200 Aufträge mit unterschiedlichen Mikrosekunden innerhalb derselben Millisekunde; mehrere Seiten und erneuter Workerstart. Fortschritt muss die exakte PostgreSQL-Zeit behalten und alle Aufträge erreichen. Zwei unterschiedlich schnelle Worker dürfen den Fortschritt nicht zurücksetzen. Nach einem Rezeptfehler und dessen Korrektur darf der fehlende Auftrag genau einmal wirken. Zusätzlich verspäteten Offline-Import und verlorene AI-Bestätigung mit dem regulären Verkaufsimport kombinieren; genau eine Wirkung am richtigen Standort.

Syntax-/Patchprüfung ausgeführt; diese Fälle noch nicht als bestanden bezeichnet. Der Zeitpunkt-Cursor ist keine allgemeine Commit-Reihenfolge: separat zu prüfen bleiben nachträglich rückdatierte Online-Abschlüsse beziehungsweise Transaktionen, die ihren alten Zahlungszeitpunkt erst nach einem schon weitergelaufenen Cursor sichtbar machen. Daraus wird keine vollständige historische Nachbuchung zugesagt.

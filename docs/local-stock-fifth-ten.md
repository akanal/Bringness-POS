# Fünftes lokales Entwicklungspaket

Basis: 0191c20, nach den vier vorhandenen Paketen. Zweig: work/stock-arithmetic-fifth-ten-20261021. Kein Upload, keine Live-Schaltung. Neue Prüfungen verwenden ausschließlich lokale künstliche Daten.

## 1. Validate signed stock balances with shared decimal precision

Negative physische Bestände aus historischen Verkäufen bleiben zulässig. Für Buchungsberechnungen gelten dennoch dieselben Dezimal-, Endlichkeits- und Mengengrenzen wie bei positiven Mengen.

## 2. Calculate rounded ingredient products with exact integer multiplication

Multiplikation aus Rezeptmenge und Portionen verwendet BigInt vor dem Aufrunden auf Tausendstel. Damit entfällt die epsilonabhängige Gleitkommaentscheidung; übergroßer Verbrauch wird weiterhin abgewiesen.

## 3. Reserve recipe quantities using exact validated stock units

Annahme vergleicht Bestand, bestehende Reservierung und benötigte Menge als ganze Tausendstel. Sie speichert den geprüften neuen Reservierungswert unter der vorhandenen Zeilensperre und weist ungültige Bestandswerte zurück.

## 4. Release and consume reserved ingredients without floating point balance drift

Zubereitung und Storno verwenden denselben geprüften Tausendstel-Abgleich. Ein Storno verändert den physischen Bestand nicht. Zubereitung schreibt den geprüften Endbestand und verwendet exakt diese Vorher-/Nachherwerte im Bewegungsprotokoll.

## 5. Bound partial ingredient returns with exact original consumption snapshots

Teilrückgaben vergleichen ursprünglichen Verbrauch, bereits zurückgegebene Menge und neue Rückgabe als ganze Tausendstel. Rückgabesumme, Endbestand und Auditwerte stimmen überein; beschädigte Snapshots und übergroße Endbestände blockieren die Buchung.

## 6. Treat invalid numeric recipe balances as unavailable

Die Verfügbarkeitsberechnung und die Ausverkauft-Sperre weisen NaN, unendliche/überhöhte Mengen, Null-Zutaten und fehlende Bestandswerte ab. Drei neue echte PostgreSQL-Fixtures prüfen die bisher problematischen NaN-Vergleiche sowie eine Null-Rezeptmenge. Der große Rundungs-Testfall wurde auf eine innerhalb der bestehenden Verbrauchsgrenze liegende Menge korrigiert.

## 7. Use validated exact balances when releasing blocked recipes

Die manuelle Rezeptfreigabe verwendet denselben Mengenprüfer wie eine tatsächliche Annahme. Ungültige Reservierungen, NaN oder überhöhte Werte können dadurch eine Ausverkauft-Sperre nicht aufheben. Die PostgreSQL-Fixtures prüfen die verweigerte Freigabe zusätzlich zur Anzeige.

## 8. Recheck active restaurant authority inside recipe release transactions

Vor einer Rezeptfreigabe wird das aktive Restaurantkonto unter der bestehenden Kontosperre erneut geprüft. Eine inzwischen wirksame Betriebssperre verhindert die Freigabe, auch wenn die Sitzung zuvor noch gültig war. Neue Prüfung bestätigt Rollback und ausbleibendes Update bei gesperrtem Konto.

## 9. Recheck active restaurant authority before saving recipe edits

Anlegen und Bearbeiten von Rezepten prüfen das Restaurantkonto innerhalb der Schreibtransaktion erneut. So führt eine zwischen Anmeldung und Speicherung wirksam gewordene Betriebssperre nicht mehr zu einem Rezeptupdate. Die bestehende Integration prüft den direkten Aufruf mit zuvor authentifiziertem Akteur und unveränderte Rezeptanzahl.

## 10. Authorize API stock key creation and rotation inside account transactions

Neue Lager-API-Zugänge und Schlüsselerneuerungen prüfen das aktive Restaurantkonto unter derselben Kontosperre wie Lagerbuchungen. Eine zwischenzeitliche Sperre darf weder einen Zugang erzeugen noch den bisherigen Schlüssel ersetzen. Die Integration prüft nach verweigerten Aufrufen unveränderte Schlüssel-Hashes und Verbindungsanzahl. Rückgabe des einmaligen Klartextschlüssels erfolgt erst nach bestätigtem Commit. Gemeinsame spätere Parallel-/Praxisfälle dokumentiert.

## Zusätzliche Integrationskorrektur

Der vollständige AI-Lauf deckte eine Inkompatibilität des dritten Pakets auf: Streng validierte Lager-Zielmengen wurden direkt mit einer berechneten Tagesdurchschnittsprognose befüllt, deren Nachkommastellen nicht begrenzt sind. Intern berechneter Bedarf wird jetzt auf das nächste Tausendstel aufgerundet, bevor er die unverändert strenge Lagerprüfung erreicht. Reine Gleitkommaabweichungen an einer bereits exakten Tausendstelgrenze werden neutralisiert. Manuelle Mengen mit zu vielen Nachkommastellen bleiben ungültig. Keine Bestellung wird dadurch ausgelöst. Diese notwendige Korrektur wird zusätzlich zu den zehn Blöcken gespeichert.

## Prüfergebnis und Grenzen

- npm test: 570 bestanden, null Fehler und keine übersprungenen Tests. Die sieben fokussierten Regressionstests dieses Pakets sind darin enthalten.
- stock-arithmetic-fifth.test.js: sieben fokussierte Fälle bestanden, einschließlich Mengenrundung, Grenzwerten, Teilrückgaben und verweigerter Rezeptfreigabe nach Kontosperre.
- stock-lifecycle.mjs: 39 PostgreSQL-/Inventur-/DOM-Szenarien bestanden. Die drei neuen Datenbankfälle prüfen NaN-Bestand, NaN-Reservierung und Null-Rezeptzutat einschließlich verweigerter Freigabe.
- pos-stock-bridge.mjs: 37 Szenarien mit getrennten eingebetteten PostgreSQL-Engines bestanden. Zusammen sind dies 76 Lager-/POS-AI-Szenarien.
- Vollständige lokale AI-Integration bestanden, einschließlich Einkaufsplanung und drei zusätzlichen Aufrufen mit bereits authentifiziertem, inzwischen gesperrtem Restaurantkonto: Rezeptschreiben, Verbindungsanlage und Schlüsselrotation. Keine neue Verbindung oder Schlüsseländerung bei Ablehnung.
- Der erste vollständige AI-Lauf schlug wegen überpräzisem intern berechnetem Beschaffungsziel fehl. Nach der dokumentierten Korrektur bestand derselbe vollständige Lauf. Die anfänglich zu groß gewählte Testmenge im fokussierten Rundungsfall wurde innerhalb der bestehenden Verbrauchsobergrenze gewählt; die Obergrenze selbst wurde nicht gelockert.
- Syntax- und Patchprüfung bestanden. Vorhandene lokale Abhängigkeiten wurden wiederverwendet; keine Änderungen an Abhängigkeitsdateien.
- Echte parallele PostgreSQL-Sitzungen für die zusätzlich geschützten Verwaltungswege, frühere offene Betriebssperrprüfung und die praktische Geräte-/Netzabnahme sind nicht durch eingebettete Datenbankläufe ersetzt.
- Zehn zusammenhängende Entwicklungsblöcke plus eine im vollständigen Lauf notwendige Integrationskorrektur, insgesamt elf neue lokale Commits. Kein GitHub-Upload, kein Deployment, keine produktive Zahlung, Bestellung, Mailzustellung oder Datenänderung.

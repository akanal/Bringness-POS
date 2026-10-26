# Import-Assistent für Angebotsentwürfe

1. Bringness-Sicherungen werden zunächst ausschließlich lokal geprüft, ohne Netzwerkaufruf oder Speicheraktion. Dateien bis 4 MB und 200 Quellzeilen werden für die Vorschau akzeptiert.
2. Jeder Eintrag wird unabhängig validiert. Fehlerhafte Zeilen bleiben gesperrt; sie verhindern die Prüfung anderer gültiger Zeilen nicht. Technische Konto-/Anfragefelder aus Dateien werden verworfen.
3. Die Vorschau zeigt Titel, Kategorie, Angebotsart, Preis und Steuerstatus. Beschreibung, Versand beziehungsweise Bereitstellung sind aufklappbar.
4. Einzelne gültige Zeilen lassen sich gezielt auswählen. Alternativ ergänzt eine ausdrückliche Schaltfläche sichtbare gültige Zeilen bis zur verbleibenden Kapazität; versteckte vorhandene Auswahlen bleiben erhalten.
5. Suche und Filter unterscheiden gültige, fehlerhafte und mit Duplikathinweisen versehene Quellzeilen, ohne Daten zu verändern.
6. Gleiche Artikelnummern in der Datei oder in vorhandenen lokalen Entwürfen sowie gleiche lokale Titel werden als Hinweise gezeigt. Es wird nichts automatisch zusammengeführt oder überschrieben.
7. Die Zusammenfassung nennt Quelldatensätze, gültige/fehlerhafte Einträge, Auswahl und freie lokale Plätze. Insgesamt bleiben 50 lokale Entwürfe möglich.
8. Übernahme erfordert ausdrücklichen Klick und Bestätigung. Jede importierte Kopie bekommt eine neue Kennung. Die vorhandene Liste und das geöffnete Formular werden nicht ersetzt. Speicherfehler erhalten Auswahl und bisherigen Datenstand; es gibt keine automatische Wiederholung.
9. Verwerfen, pausierte Ansicht und Kontowechsel entfernen die private Dateivorschau. Verspätete Leseergebnisse können sie nicht wiederherstellen. Eine gewählte, noch nicht übernommene Auswahl wird beim Verlassen berücksichtigt. Der Tastaturfokus bleibt beim Auswählen erhalten.
10. Die lokale Schreibfunktion lehnt übergroße Daten und doppelte beziehungsweise ungültige Kennungen vor dem Schreiben ab. Dadurch kann kein neuer Speicherstand entstehen, der an der bestehenden Lesegrenze von 600.000 Zeichen scheitert. Hilfetexte erklären die neue Vorschaugrenze und unveränderte lokale Kapazität.

Der Import verändert keine Kontoentwürfe, Preise, Verträge, Freischaltungen, Zahlungen oder Veröffentlichung. Der Nutzer kann später einzelne geprüfte Formularangaben wie bisher ausdrücklich in sein Betriebskonto speichern. Größere Sicherungen bleiben im Original vollständig erhalten, auch wenn nur eine Teilmenge lokal ergänzt wird.

Prüfungen: gemischte Dateien, Obergrenzen, neue IDs, unveränderte Bestandszeilen, ungültige Auswahl, Duplikate, Speicherfehler, ausdrückliche Bestätigung, Fokus und verspätete Dateien. Die tatsächliche Anwendung wird mit PostgreSQL/Chromium inklusive Dateiauswahl und lokalem Teilimport geprüft; es werden keine Produktionsfixtures oder echten Anbieteraufrufe verwendet.

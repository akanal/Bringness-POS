# Rabatte und geparkte Bons – 18.10.2026

## Fertiger Entwicklungsumfang

Grundkasse und Händleransicht erhalten einen einklappbaren Bereich „Rabatt & geparkte Bons“. Warenkorbrabatt als EUR-Betrag oder Prozent mit zwei Nachkommastellen; Prozente werden intern als ganzzahlige Basispunkte übertragen. Es muss ein positiver Restbetrag verbleiben. Einzelartikelrabatte, kostenlose Null-Euro-Abschlüsse und Offline-Rabatte werden nicht neu eingeführt.

Der Server berechnet Originalpreise/Mengenstaffeln und Rabatt erneut. Centgenaue anteilige Verteilung mit stabiler Restcentvergabe je Position; Steuer wird aus den rabattierten Positionsbeträgen berechnet. Eingabeprüfung, Betrag, Bonreferenz und Rabatt sind Bestandteil der unveränderlichen Zahlungskennung. Kartenzahlungen bleiben ohne verifizierte Terminalintegration gesperrt.

Originalpreise bleiben gespeichert. Belege speichern Rabattart/-wert, Zwischensumme, Gesamtrabatt, Positionsverteilung und ausführenden Benutzer atomar. PDF/A4, öffentlicher digitaler Beleg, Steuerberaterdaten und CSV zeigen beziehungsweise enthalten den Rabatt. Der INSERT-Trigger für vorbereitete TSE-Daten erhält die Verteilung bereits bei der Belegerstellung; Steuergruppen und Positionsbeträge stimmen mit dem Zahlbetrag überein. Keine produktive TSE-Aktivierung.

Geparkte Bons werden serverseitig je Betrieb und Unternehmen benannt gespeichert. Parken erzeugt weder Bestellung noch Zahlung noch Beleg und reserviert keinen Warenbestand. Bei Aufnahme werden aktuelle Artikel und Preise verwendet. Nicht mehr verfügbare Artikel werden nicht still entfernt. Der ursprüngliche Bon bleibt bis zum tatsächlichen Zahlungsabschluss gespeichert. Überarbeitungen verwenden eine Versionsnummer; veraltete Änderungen werden abgewiesen. Beim Abschluss sperrt die Transaktion den Bon und markiert ihn erst gemeinsam mit Verkauf, Zahlung und Beleg als bezahlt. Derselbe Bon kann auch mit unterschiedlichen Zahlungskennungen nicht zweimal bezahlt werden.

Unklare Parkübertragungen behalten lokal dieselbe Kennung und denselben Inhalt; erneutes Speichern gleicht diese Operation ab. Eine ausdrücklich bestätigte lokale Rücksetzung löscht keine serverseitigen Bons und keinen Warenkorb. Zahlungswiederherstellung bleibt davon getrennt. Unklare Zahlungen dürfen nicht durch Parken umgangen werden. Geparkte Bons und diese Rabatte benötigen eine Onlineverbindung; der Windows-Offline-Verkauf wird nicht umgestellt.

## Prüfungen

- 510 Unit-Tests lokal bestanden, einschließlich 500 deterministischer Rabatt-/Restcentkombinationen.
- Datenbankintegration: keine Finanzbuchung durch Parken; identisches Speichern/Update nach verlorener Antwort; Versionskonflikte; Mandantentrennung; falsche Zahlungsbeträge; überhöhte Rabatte; vollständiger Rollback einschließlich Bonstatus; Wiederholung desselben Zahlungsrequests; Ablehnung einer zweiten Zahlung für denselben Bon.
- Echter TSE-Vorbereitungstrigger und echter PDF-/Digitalbeleg: gemischte 19-/7-Prozent-Positionen, 28,85 EUR Zwischensumme, 3,61 EUR Rabatt, 25,24 EUR Zahlbetrag; Positions- und Steuersummen nach Rabatt geprüft.
- Tatsächliche Clients mit JSDOM: Rabatt in Grundkasse/Händleransicht, angezeigter Zahlbetrag, gesperrte Rabattänderung während unklarer Zahlung, unveränderliche Wiederholung, sichere Bonaufnahme und HTML-Escaping.
- Vorhandene Checkout-, Händler-, Accountant- und Offline-Accountant-Regressionen bestanden. Die CI ergänzt fünf gleichzeitige Zahlungsversuche mit unterschiedlichen Kennungen für denselben geparkten Bon auf PostgreSQL 16.
- Keine echte Zahlung, kein Kundenverkauf, keine Testmail und keine Veröffentlichung in diesem Entwicklungsblock.

## Weiterhin offen

Kundenverwaltung, ausgehende Lieferscheine, Pfand/Leergut, Kassenöffnung/-abschluss, Erstattungen, Gutscheine und die detaillierten Handelsberichte aus dem vorherigen Abgleich sind separate Folgeblöcke.

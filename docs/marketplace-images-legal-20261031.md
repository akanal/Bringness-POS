# Marktplatz: Produktbilder und Rechtstext-Platzhalter

## Umsetzung

Eigenständiger Produktbild-Zugang unter `/api/v1/shop/marketplace/images`. Er verwendet die bestehende geschützte IDrive-Konfiguration, aber ausschließlich den neuen Objektnamensraum `marketplace/product-images/`. Private Kontodokumente bleiben unter `documents/accounts/` und erhalten keine öffentliche Route. Keine Bucket-Policy/ACL geändert; öffentliche Bytes werden nur durch die Anwendung nach Zuordnungsprüfung ausgeliefert.

Aktive Inhaber/Administratoren freigegebener Händler können ein PNG/JPEG je eigenem Kontoangebot zuordnen, ersetzen oder die Zuordnung entfernen. Maximal 5 MiB Eingang, 6000 Pixel je Dimension und 16 Millionen Pixel; Größenprüfung vor Dekodierung. Neukodierung als PNG, maximal 1600 Pixel längste Seite, entfernt ursprüngliche Metadaten und sonstige Dateiinhalte. UUID, ursprünglicher Request-Digest, Bildstand und Konto binden jeden Upload. Dauerhafte Absichten begrenzen auch fehlgeschlagene Uploads auf 20 je Konto/200 insgesamt pro 24 Stunden; dauerhaft maximal 100 MiB normalisierte Bilddateien je Konto. Zwei gleichzeitige HTTP-Bildanfragen begrenzen Ressourcen. Bestehende Dateiablage unverändert.

Veröffentlichte und nicht archivierte Angebote freigegebener Händler dürfen ausschließlich ihr aktuell zugeordnetes Bild liefern. Zurückziehen, Händler-Sperre, Ersatz oder Entfernung sperren alte Bild-URLs. Öffentliche Antwort: PNG, no-store, nosniff, same-origin Resource Policy; keine S3-URLs oder privaten Kontoreferenzen. Entwürfe liefern keine öffentlichen Bilder. Entfernen löst die Zuordnung; physische Objekte und begrenzte Uploadabsichten bleiben zunächst erhalten. Es gibt noch keinen automatischen Lösch-/Aufräumdienst. Ein verlorener Uploadbeleg kann im selben geöffneten Editor mit derselben Anfrage wiederholt werden; Neuladen zeigt den gespeicherten Stand.

## Rechtstexte

Bestehende Impressum-/Datenschutz-Platzhalter wiederverwendet, keine Betreiberangaben erfunden. Neue `/shop/legal.html` mit eindeutig unvollständigen Bereichen für Käuferbedingungen/Verkäuferrollen, Widerruf/Musterformular, Versand/Zahlung, Datenschutzdiensteliste und Händlerguthaben. Footerlinks in allen Shop-HTML-Seiten; zusätzlicher Entwurfshinweis bei Konto/Registrierungszugang, Marktplatzbestätigung und Händleransicht. Bestehende Cookie-Einwilligung bleibt erhalten. Keine Zustimmung zu einem unvollständigen Vertragstext implementiert. Vollständige Rechtstexte und Einbeziehung bleiben ungeklärt.

## Zehn Punkte: tatsächlicher Stand

1. Produktbilder: Backend, Händlerbedienung und öffentliche Anzeige implementiert; Tests siehe Abschluss.
2. Ersatz/Entfernung: Konto-/Freigabeprüfung, Revisionen und Wiederholungsschutz implementiert. Physische Bereinigung noch offen.
3. Mollie-Verbindungsanzeige bereits vorhanden, wiederverwendet. Öffentliches unauthentifiziertes merchant-status antwortete 409; dies ist kein Nachweis einer funktionierenden Händler-OAuth-Verbindung.
4. Automatischer Provisionsabzug: weiterhin blockiert. Der vorhandene TEST-Adapter lehnt Application Fees ausdrücklich ab. Ein bloßes Hinzufügen würde dessen geprüften Zahlungs-/Betragsvertrag ändern. Abrechnungs-/Umsatzsteuerbeleg und konkrete Händler-OAuth-Anbindung sind noch nicht verbunden.
5. Automatische Erstattungsübernahme: LIVE-Leser/Journal vorhanden, aber keine produktive Aktivierung, kein verbundener verifizierter Warenpositions-/Steueradapter.
6. Voll-/Teilprovisionsguthaben: vorhandene transaktionale Buchhaltung getestet. Tatsächliche abgerechnete Provision und Erstattungs-Nettozuordnung müssen belegt sein; Brutto-Refund wird nicht durch einen geratenen Steuersatz geteilt.
7. Verrechnung: vorhandener transaktionaler Callback getestet; persistente neue Provisionsreservierung und Providerdispatch fehlen weiterhin.
8. Kündigung/Auszahlung: bestehende Sperre und Nachweisverarbeitung getestet; echte Vertragsbeendigungsquelle, Bank-Auszahlungsreservierung und Transfer-/Recoveryprozess fehlen. OAuth-Disconnect ist keine Kündigung. Keine fingierte Banküberweisung oder Kündigung angelegt.
9. Händlerbeschreibung/AGB: bestehende Guthabenregel erhalten; ergänzende Rechtstextbereiche und Links implementiert, alles ausdrücklich ungeprüfter Entwurf.
10. Lokale Tests und ergänzte Testliste; separate PostgreSQL-/native Browserprüfungen in vorhandener Shop-CI ergänzt. Ergebnisse erst nach erfolgreichem Lauf als bestanden melden.

## Externe Prüfung

Am 31.10.2026 bestätigte der öffentliche bestehende Dokumentstatus configured:true/available:true; Marktplatz erreichbar, canPay:false und keine öffentlichen Angebote. Dies bestätigt vorhandene App-IDrive-Konfiguration, keinen neuen echten Produktbild-Upload.

Mollie-Dokumentation geprüft: https://docs.mollie.com/docs/application-fees und https://docs.mollie.com/reference/testing . Application Fees werden bei Käufererstattung nicht automatisch zurückgegeben; TEST-Zahlungen verschieben kein echtes Application-Fee-Guthaben. Der echte Gebühren-Geldfluss braucht später einen gesondert konkret autorisierten kleinen LIVE-Nachweis, den dieser Auftrag nicht ausführt. Keine echten Zahlungen, Anbieterzustimmungen, Händlerfreigaben oder Testprodukte in Produktion erzeugt.

## Abschlussprüfung dieser Sitzung

- Vollständiger abschließender lokaler Shoplauf: 742 Tests bestanden, keine Fehler und keine übersprungenen Tests. Zuvor gefundener Bild-HTTP-Fehler (JSON-Leser mit 16-KiB-Obergrenze statt Datei-Leser) behoben; HTTP-Upload und Auslieferung im Nachlauf erfolgreich.
- 12 gezielte Bild-/UI-/IDrive-Namensraum-/Rechtstextprüfungen bestanden. Private und öffentliche Objektpfade bleiben auch bei gleichem Konto/Datei-ID/Inhalt getrennt.
- 686 allgemeine Unit-Tests bestanden, keine Fehler/Skips.
- Zahlungssicherheitslauf: 153 bestanden, 4 Prüfungen mit separatem PostgreSQL-Server übersprungen, keine Fehler. Kein realer Mollie-Geldfluss.
- Nach dem vollständigen Lauf nur Rechtstext-Titel, expliziten Hinweis auf der Registrierungsseite und umbruchfähige Footerformatierung ergänzt; gezielte Rechtstextprüfung ebenfalls bestanden. Browser/PostgreSQL-Abnahme bleibt unbestätigt.
- JavaScript-Syntax und git diff --check ohne Befund.

GitHub-Veröffentlichung blockiert: Automatische Freigabeprüfung hat git push zunächst wegen nicht ausreichend verifiziertem Ziel, nach Abgleich des verbundenen Eigentümerkontos und Repository-Schreibrechten erneut wegen fehlender ausdrücklich auf diesen Upload bezogener Zustimmung abgelehnt. Kein alternativer Upload oder Umgehen der Ablehnung. Remote-PR198 blieb nach bestätigter Nachprüfung auf cfcd916b27e85d829c3fa5d69545e4b940225146. Neue Änderungen nur lokal committed. Dadurch keine neue CI-Ausführung, kein Merge und keine Netcup-Bereitstellung. Nutzer um ausdrückliche Erlaubnis zum Hochladen nach akanal/Bringness-POS, Branch marketplace-commission-net, bitten. Vor späterer Liveschaltung CI einschließlich neuer nativer Produktbild-/PostgreSQL-Abnahme prüfen. Produktive Gebühren-/Refund-/Bankadapter und vollständige Rechtstexte bleiben davon getrennte offene Voraussetzungen.

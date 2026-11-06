# Zentrale Marktplatzverwaltung

Einstieg nach Bereitstellung: `/superadmin/` → Marktplatz. Nur bestehende aktive Plattformadministratoren; keine neue Rollenvergabe. Der Marktplatz benutzt die bestehende Plattform-Sitzung, nicht das möglicherweise parallel angemeldete Händlerkonto.

- Händler: bestehende paginierte Händlerprüfung mit Profil, Historie, Freigeben/Ablehnen/Sperren/Wiederfreigeben, Prüfbestätigung und identischem Wiederholen einer unbestätigten Entscheidung. Bestehende Sperr-/Veröffentlichungsregeln unverändert.
- Rechtliche Informationen: sechs aufklappbare Textbereiche, bestehende gekennzeichnete Texte als Anfangsentwurf. Entwurf speichern, lokale Textvorschau, gespeicherten Text ausdrücklich prüfen und separat veröffentlichen. Kein HTML-Editor; HTML wird ausschließlich als Text dargestellt. Bis zur Veröffentlichung bleibt der vorherige öffentliche Text erhalten; noch nicht publizierte Bereiche behalten ihre statischen Entwürfe.
- Übersicht: Einstiege und ausdrücklich noch nicht eingerichtete Marktplatz-Lizenzen. Keine Gebietsrechte, Vergütung, Partnerrollen oder automatische Abrechnung erfunden. Angebote/Bestellungen erhalten keine neuen administrativen Schreibaktionen.

Private Inhalte werden bei Konto-/Seiten-/Sichtbarkeitswechsel geschlossen. Offene Entwürfe warnen vor bewusstem Navigieren. Netzwerkfehler lassen identisches Wiederholen zu; ein neuer gespeicherter Stand kann nach ausdrücklichem Verwerfen erneut geladen werden. Versionskonflikte überschreiben keine neueren Texte. Datenbankspeicherung enthält Entwurf, veröffentlichten Text, Zeitpunkt, Actor/Revision/Aktion und Anfragebelege. Keine produktiven Textinhalte werden durch Codebereitstellung automatisch veröffentlicht. Die vorhandene globale Kennzeichnung als rechtlicher Entwurf und die separaten Handels-/Zahlungssperren bleiben erhalten.

Neue Routen: GET/POST `/api/v1/platform/marketplace/legal`, öffentliches GET `/api/v1/shop/legal`. Jede private Anfrage prüft aktive Plattformmitgliedschaft, aktive/unabgelaufene Sitzung und Passwortwechselstatus. Schreibzugriffe benötigen passenden Origin, JSON, begrenzten Body und geprüfte Revision; Veröffentlichung muss den exakt gespeicherten Entwurf bestätigen. Transaktionale Sperren und dauerhafte Anfragebelege verhindern doppelte/widersprüchliche Wiederholungen.

Prüfung: SQL-/HTTP-Regression mit isoliertem PGlite; UI-/XSS-/Kontowechselprüfung; vorhandene Händlerprüfungsregression. Native Browserprüfung mit tatsächlichem Produktionseinstieg und disposable PostgreSQL in Shop-CI: zentrale Navigation, Plattformtoken, Entwurf, Veröffentlichung, Händlerliste und öffentliche Textübernahme bei 390/1280 px. Screenshots enthalten nur synthetische CI-Daten.

Wegen der vom Eigentümer gemeldeten Netcup-Störung zunächst als geprüften Pull Request bereitstellen; keine Bereitstellung während der Störung behaupten.

## Lesende Übersicht, Angebote und Bestellungen

Folgepaket auf PR232: Übersicht mit offenen Händleranträgen, freigegebenen Händlern, Angebots-/Veröffentlichungs- und Bestellzahlen sowie abweichenden/unveröffentlichten Rechtstextentwürfen. Zahlen beschreiben den aktuellen Datenstand, keine Zahlungs- oder Rechtsfreigabe. Ein noch nie veröffentlichtes Angebot und ein gespeicherter privater Entwurf bleiben unterscheidbar.

Die neuen rein lesenden Listen zeigen höchstens25 Einträge pro Seite. Angebote: Titel-/Angebotsnummernsuche, Händlername, Kategorie, Entwurfs-/Archivstand und Veröffentlichungsstand. Bestellungen: Referenzsuche, Händlername, Bearbeitungsstatus, Datum und vorhandener EUR-Gesamtbetrag; neueste zuerst mit zeitgenauem Cursor inklusive Kennung. Keine Käuferkontakte, Anschriften, Versanddokumente oder Zahlungsbehauptungen. Keine Änderungen an Bestellungen, Beständen, Angeboten, Zahlungen, Rollen oder Lizenzen.

Neue GET-Routen `/api/v1/platform/marketplace/overview`, `/offers`, `/orders` prüfen pro Anfrage die vorhandene aktive Plattformmitgliedschaft. Herkunft, Parameter, Suchlänge, Cursor und Body werden geprüft. Neue Oberfläche verwendet denselben Plattformtoken und dieselben Regeln für Kontowechsel/verspätete Antworten wie der Rechtstexteditor. Keine neuen Zugangsdaten oder Migrationen.

SQL-/HTTP-Regressionsprüfung umfasst26 synthetische Angebote/Bestellungen, vollständige zweite Seite, Rollenentzug, ungültige Cursor, Doppelparameter, abgelehnte Schreibmethoden und Ausschluss privater Kontakt-/Versandfelder. UI prüft Suche, Seitenwechsel und Textdarstellung. Produktions-Einstiegstest prüft zusätzlich neue Kennzahlen/Listen, leere Suchergebnisse und390/1280px. Bereitstellung bleibt während der gemeldeten Netcup-Störung zurückgestellt.

## Lesende Detailansichten

Angebots- und Bestellkarten haben „Details ansehen“. Zurück erhält die ursprüngliche Suchseite und den Cursor. Angebotsdetails unterscheiden aktuellen Entwurf und gespeicherten Veröffentlichungsstand einschließlich Varianten, Preisen, Beständen und Versandangebot; eine zurückgezogene Veröffentlichung wird dadurch nicht erneut öffentlich. Anzeige der tatsächlichen öffentlichen Sichtbarkeit berücksichtigt Händlerfreigabe und Archivstand.

Bestelldetails zeigen ausschließlich Referenz, Händlername, Bearbeitungsstatus, Datum, Lieferart, gespeicherte Positionen mit Stückpreis/USt. und die vorhandenen Netto-/Steuer-/Gesamtbeträge. Statusverlauf enthält höchstens50 Übergänge, Stand und Zeitpunkt; interne Actor-Kennungen bleiben verborgen. Käuferkontakte, Empfängeranschriften, Originalversandobjekte und private Notizen werden auch in den Details nicht ausgeliefert. Die Ansicht ist keine Zahlungsbestätigung.

Neue GET-Endpunkte `/api/v1/platform/marketplace/offer?number=…` und `/order?id=…` prüfen bestehende Plattformrechte und geben nur ausdrücklich ausgewählte Felder zurück. Fehlende Datensätze404, ungültige/zusätzliche Parameter400; keine neuen Datenbanktabellen oder Schreibaktionen. Native Prüfung erfolgt nach dem bestehenden tatsächlichen Händler-/Bestellablauf, damit Detailkarten mit echten API-Testdatensätzen statt leeren Listen geprüft werden. Nur isolierte Testdaten, keine Produktion.


## Bereitstellung bestätigt — 06.11.2026
Die frühere Netcup-Pause ist für dieses Adminpaket aufgehoben. Nach frischer erfolgreicher Sicherung und allen sechs bestandenen Prüfungen wurde PR232 einschließlich PR233 als9b7d10d641e7237fc1b1baa9d6a78411c5f74891 exakt über Netcup42211891096/job127872288118 bereitgestellt. Vorheriger Container und Datenbanksicherung erhalten. Öffentlich ausgelieferte Dateien entsprechen der geprüften Quelle; Admin-HTML enthält zusätzlich die vorhandene Brand-Script-Injektion. Neue private Routen verlangen Anmeldung, Rechtstext-API ist bereit und enthält noch keine veröffentlichten Abschnitte. Einstieg: https://bringness.de/superadmin/ → Marktplatz. Keine produktiven Testkonten oder Bestellungen angelegt; Rechts-/Zahlungs-/Lizenzfreigaben bleiben getrennt.

## Marktplatz-Einstieg, Filter und Rechtstext-Verlauf

Nach erfolgreicher bestehender Plattformanmeldung öffnet Superadmin unmittelbar den Marktplatz. Andere vorhandene Systeme bleiben unverändert anwählbar. Händler lassen sich nach Geschäftsname/geschäftlicher E-Mail und aktuellem Freigabestatus filtern; Suche und Status werden vor der bestehenden begrenzten Pagination serverseitig angewendet. Händlerentscheidungen behalten ihre bestehenden Prüf-/Bestätigungsregeln.

Angebote und Bestellungen erhalten Händlernamens- und Statusfilter. Angebotsfilter unterscheiden den aktiven/archivierten Entwurfsstand vom gespeicherten Veröffentlichungsstand, ohne damit öffentliche Sichtbarkeit zu behaupten. Bestellfilter betreffen ausschließlich den Bearbeitungsstatus. Neue Suche/Filter beginnen auf Seite1; weitere Seiten und der Rückweg aus Details erhalten die Auswahl. Keine neuen Schreibaktionen.

Jeder der sechs Rechtstextbereiche bietet „Gespeicherte und veröffentlichte Versionen“ → „Verlauf laden“. Höchstens20 Einträge je Seite mit Revision, Aktion, Zeitpunkt und Text; ältere Versionen explizit laden. Der aktuelle Entwurf bleibt unangetastet. Keine Wiederherstellungs-/Veröffentlichungsaktion aus dem Verlauf; keine internen Actor-Kennungen in der Antwort. Neue private GET-Route `/api/v1/platform/marketplace/legal-history?id=…&cursor=…` verwendet die vorhandene Plattformautorisierung und Tabellen. Ungültige Abschnitte, zusätzliche/doppelte Parameter und unzulässige Schreibmethoden werden abgewiesen. Keine neue Migration.

Prüfungen: kombinierte SQL-Suche/Statusauswahl, verworfene unbekannte Filter, Pagination/Filtererhalt und Textdarstellung;23 tatsächlich gespeicherte Datenschutz-Entwürfe mit20+3-Verlaufseiten in isolierter Datenbank, Trennung von Entwurf/Veröffentlichung und verweigerter Händlerzugang. Native Prüfung ergänzt direkten Marktplatz-Einstieg nach Anmeldung, tatsächliche Filterrequests und gespeicherte/veröffentlichte Textstände bei390/1280px. Alle Daten synthetisch. POS/Personal/Display/Center und Lizenzentscheidungen außerhalb des Blocks.


## Filterpaket live bestätigt — 06.11.2026
PR236 wurde nach776 bestandenen Shop-/699 allgemeinen Tests, fünf erfolgreichen Feature-Workflows und erneuter authentifizierter Netcup-Sicherung exakt alsf8ccdd841ab429931a4fb89fb06a49035c712592 bereitgestellt (Netcup42227282533/job127923866104). Vorheriger Container und Datenbanksicherung erhalten. Drei Skripte und normalisierte zentrale Admin-HTML frisch200/quellgleich; neue private Filter-/Verlaufrouten ohne Anmeldung401/no-store. Keine Produktionsfixtures oder Rechtstextänderungen zur Abnahme. Besitzer lädt https://bringness.de/superadmin/ neu; Marktplatz öffnet nach Anmeldung unmittelbar.

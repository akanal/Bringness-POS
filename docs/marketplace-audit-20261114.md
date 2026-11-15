# Marktplatz-Abgleich vom 14. November 2026

Ausgangsstand: `57d258485a392729d0a25d44cf42a761923ad599` (main). AGENTS.md und PROJECT-HANDOFF.md berücksichtigt. Keine Bereitstellung, Domainänderung oder echte Zahlung. Ausschließlich isolierte synthetische Schreibtests; öffentliche Produktionsprüfung nur lesend.

| Punkt | Ergebnis und Grenze |
|---|---|
| 1 Registrierung | Bestehende SQL-/HTTP-/DOM-Prüfungen erfolgreich: Pflichtangaben, Normalisierung, atomare Anlage, Antwortverlust und identische Wiederholung. Keine neuen Produktivkonten. |
| 2 Anmeldung / Passwort | Loginprüfungen erfolgreich. Shop hatte keinen Einstieg zur bestehenden Passwortwiederherstellung. Vorhandener gemeinsamer Passwortdienst nun direkt aus der Shop-Anmeldung erreichbar; keine Weiterleitung zur POS-Oberfläche, keine Tokenübernahme und kein neuer Passwortdienst. Echte E-Mail-Zustellung und kompletter Reset nicht geprüft. |
| 3 Händleranlage | Isolierte Händleranträge, Wiederholungen, Fehler-Rollback und erneute Einreichung erfolgreich. Der konkrete frühere Produktivfehler nicht reproduziert: genaue Fehlermeldung und betroffene Schritte fehlen. Keine Behauptung, dieser Fehler sei behoben. |
| 4 Adresse | Vorhandene Stadt-/Ländervorschläge sowie Adressvalidierung getestet. Anschriften werden nicht geraten; Straßen-/PLZ-Angaben bleiben erhalten. Öffentliche Adressreferenz liefert HTTP200. Keine neue vollständige Adressvalidierung behauptet. |
| 5 Händlerprüfung / Freigabe | SQL-/HTTP-/Oberflächenprüfungen für ausdrückliche Zustimmung, Plattformfreigabe, Revision und Replay erfolgreich. Keine automatische Händlerfreigabe. |
| 6 Ablehnung / Sperrung / Rechte | Tests bestätigen verweigerte Selbstfreigabe, Mandantentrennung, entzogene Plattformrechte und zurückgezogene Veröffentlichungen bei Sperre. Wiederfreigabe veröffentlicht nichts automatisch. |
| 7 POS-Angebot | pos-online im lokalen und ausgelieferten Katalog vorhanden: 34,99 EUR netto monatlich. Vorhandene Hide-all/Undo/Restore-all-Prüfung bestanden. Persönliche Browserausblendung des Inhabers nicht verändert; oberhalb der Liste „Alle wieder anzeigen“ verwenden. Kein neues Angebot angelegt. |
| 8 Markt / POS / AI | Vorhandene getrennte Sitzungsschlüssel und feste Produktrouten anhand Code und Tests geprüft. Gemeinsame Kontoidentität bleibt erhalten; kein Kopieren von Sitzungstokens. |
| 9 Rechtstexte / Cookies | Impressum, Datenschutz, Shop-Rechtstexte und Händlerbedingungen öffentlich HTTP200. Verknüpfungen sowie Cookie-Opt-in/Widerruf getestet. Texte bleiben als Entwurf gekennzeichnet; keine juristische Prüfung oder Freigabe. |
| 10 Browser / Tablet | Zwei native Chromiumläufe versucht (Katalog und Marktplatz). Beide vor Seitenstart blockiert: socket() failed: Operation not permitted, SIGABRT. Keine native Browser-/Tablet-Abnahme dieses Stands. Kein lokales PostgreSQL vorhanden; Produktionseinstiegstest verlangt ausdrücklich eine leere disposable PostgreSQL-Datenbank und wurde deshalb nicht gegen Produktion ausgeführt. |

## Nachweise

- `npm test`: 736 bestanden, 0 fehlgeschlagen.
- `node ops/shop/run.mjs`: 872 bestanden, 0 fehlgeschlagen (isolierte SQL-/HTTP-/DOM-Suite, einschließlich synthetischer Anbieterfälle; keine echten Zahlungen).
- Gezielter Neun-Dateien-Abgleich: 47 bestanden, 0 fehlgeschlagen.
- Nach Linkkorrektur `node --test ops/shop/account-login.test.mjs ops/shop/market-legal.test.mjs`: 13 bestanden, 0 fehlgeschlagen.
- Zusätzliche DOM-/Quellprüfung: Link führt zu vorhandenem /pos/-Einstieg mit forgotPassword-Steuerung und /api/v1/auth/forgot-password.
- Öffentliche GET-Prüfung HTTP200: /shop/, /shop/account.html, /shop/seller.html, /superadmin/, /impressum/, /datenschutz/, /shop/legal.html, /shop/merchant-terms.html, /api/v1/shop/address-reference, /shop/catalog.js. HTTP200 ist keine funktionale oder authentifizierte Abnahme.

## Morgen offen

1. Native Browserabnahme mit isolierter echter PostgreSQL-Datenbank in der bestehenden geeigneten CI-/Testumgebung; Tabletgröße und tatsächliches Gerät getrennt prüfen.
2. Konkreten Händlerfehler mit Fehlermeldung und Ablauf nachstellen; allgemeine Tests konnten ihn nicht reproduzieren.
3. Passwort-E-Mail und vollständigen Reset mit einem ausdrücklich geeigneten Testkonto prüfen. Der Ergänzungslink ist noch nicht veröffentlicht.
4. Persönliche POS-Ausblendung im betroffenen Browser kontrollieren. Keine Sessiondaten aus einem anderen Gerät vorgeben.

Empfehlung: zuerst die native Abnahme und Händlerreproduktion abschließen, danach die separate gemeinsame Centersystem-Prüfung. Keine Veröffentlichung dieses Zweigs ohne den dafür vorgesehenen nächsten Auftrag.

## Fortsetzung des Nachtauftrags

Der abgeschlossene Automationslauf wurde anhand seiner gespeicherten Ausführung und seines lokalen Commits86450dd7 abgeglichen und unverändert übernommen. Ergänzend wird die native Abnahme über den vorhandenen GitHub-PR-Testweg vorbereitet, ohne Zusammenführung oder Livebereitstellung. Eigene leere Loopback-Testdatenbank `bringness_shop_night_audit` und separater tatsächlicher Produktionseinstieg verhindern Konflikte mit dem bestehenden Registrierungslimit; die Grenze wird nicht erhöht oder umgangen. Die Erweiterung des Prüfharness ist keine neue Marktplatzfunktion.

Der zusätzliche Ablauf prüft390/768/1280px: Wiederherstellung direkt in der Shop-Anmeldung, verständliche Reaktion ohne E-Mail-Eingabe ohne Versand, tatsächliche Shop-Registrierung mit PLZ→Berlin, anschließende ausdrückliche Anmeldung und getrennte Shop-/POS-Sitzungsschlüssel, POS-Angebot ausblenden/wiederherstellen, Händlerantrag mit Zustimmung und gespeicherter Status „In Prüfung“, Rechtstextziele und fehlenden horizontalen Überlauf. Bestehende Gesamtprüfung deckt manuelle Freigabe/Ablehnung/Sperre/Adminrechte sowie Cookie-Einwilligung/Widerruf ab. Keine echten Konten, E-Mails, Zahlungen oder Domains ändern.

Ergänzend lokal erneut bestanden:736 allgemeine Tests sowie13 gezielte Login-/Linkprüfungen. `node server/ai-tests/admin-reset-integration.mjs` erfolgreich: simuliertes SMTP, fehlgeschlagener Versand ohne nutzbaren Token, Reset/Einmaligkeit/Ablauf/Sitzungsentzug und Anmeldung mit neuem Passwort. Dies bestätigt den isolierten Versandpfad, keine Zustellung an ein echtes Postfach. Native Ergebnisse stehen bis zum Abschluss des PR-Laufs noch aus.

### Im vollständigen Prüflauf erkannter und korrigierter Konflikt
Die aus dem früheren Lauf übernommene POS-Verlinkung scheiterte an der vorhandenen Shop-Navigationstrennung (Shop-Lauf43663897374). Diese Prüfung wurde nicht abgeschwächt. Stattdessen fordert die Shop-Anmeldung die Rücksetzung direkt über den bestehenden `/api/v1/auth/forgot-password`-Dienst an. Keine POS-Oberfläche wird geladen; Sitzungsschlüssel bleiben getrennt. Neue Regressionen prüfen E-Mail-Eingabe, einzigen manuellen Request, unterdrückte Cookies/Authheader, generische Rückmeldung, Fehler-/Timeoutpfad sowie Abbruch und verworfene späte Antworten bei Seiten-/Kontowechsel. Die eigentliche Passwortänderung verbleibt im vorhandenen, per E-Mail geschützten gemeinsamen Rücksetzpfad. 20 gezielte Login-/Navigations-/Recovery-/Legal-Prüfungen bestanden.

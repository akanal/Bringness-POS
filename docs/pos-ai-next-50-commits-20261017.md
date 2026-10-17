# Bringness POS / AI – zweiter 50-Commit-Block, 2026-10-17

Branch: `staging/preview-20261016`. Ausgangsstand: `029736a58bf156827a2625242eb4c2ca2dcefc63`.
Geprüfter Implementierungsstand: `1f455b897961aaa6a35de0a1c0bdcb5b8221c42e`. Commit 50 ist dieser Bericht.
Die vorherigen 50 Commits bleiben unverändert erhalten. Dieser Block enthält weitere 49 Implementierungs-/Testcommits und einen Ergebnisbericht.

Kein Merge nach main, keine Produktionsbereitstellung, kein echter Zahlungsversuch, kein Provider-Vertrag, keine E-Mail an Kunden und keine Änderung der freigegebenen Gestaltung oder Preise.

## Fertiggestellte Funktionsblöcke

### Zahlungsabgleich und Abrechnung

- Provider-Eurobeträge werden als exakte Dezimalstrings in Cent gelesen; zusätzliche Dezimalstellen, andere Währungen und nicht sicher darstellbare Summen werden abgelehnt.
- Der tatsächliche POS-Billing-Webhook prüft vor einer Freischaltung Zahlungs-ID, Betrag, Währung, Kundenzuordnung und vorhandene Abo-Zuordnung. Bereits bezahlte Transaktionen können durch eine ältere Antwort nicht wieder auf offen/fehlgeschlagen gesetzt werden.
- Wiederkehrende Rechnungen setzen einen bestehenden bezahlten passenden Abovertrag voraus. Bestehende vereinbarte Beträge werden aus dem Vertrag übernommen; neue öffentliche Listenpreise überschreiben sie nicht.
- Ein Transaktionslock serialisiert die erstmalige Verarbeitung derselben wiederkehrenden Zahlung. Gleichzeitige Benachrichtigungen erzeugen eine Transaktion, eine Rechnung, einen Zugang und ein Mailereignis je Zahlung.
- Erstanlage eines Abos akzeptiert nur eine gültige Abo-Ressourcenkennung. Nach einem erzwungenen Folgefehler verwendet der erneute Anbieteraufruf denselben Idempotenzschlüssel; lokale Änderungen rollen zurück.
- Mollie-Anfragen haben feste HTTPS-Zielgrenzen, Zeit- und Antwortgrößenlimits sowie Weiterleitungsverbot. Ungeprüfte Anbieterfehlerdetails werden nicht protokolliert.
- Mahnungen werden bei ungenauen Providerbeträgen unterdrückt. Umsatzsteuer wird in ganzen Cent berechnet, und übergroße Buchungsbeträge werden abgelehnt.
- Private Vertragsdaten sind auf aktuelle Inhaber-/Admin-Sitzungen begrenzt; Konten mit erforderlichem Passwortwechsel erhalten keinen Installerzugriff.

### POS, QR und Verwaltung

- Ältere Owner-/Gast- und Lageraktionsrouten verwenden begrenzte JSON-Reader. Ungültige Objekte, beschädigtes UTF-8, mehrdeutige Zahlungskennungen und übergroße Webhooks werden kontrolliert abgelehnt.
- Tischdetails prüfen die aktive Kellnerzuordnung, bevor Bestell- oder Gastdaten ausgegeben werden.
- Alte Handy-Anwesenheitsendpunkte können die vereinbarte persönliche Stempel-PIN an der Kasse nicht mehr umgehen; historische Anwesenheitsdaten bleiben erhalten.
- Gastwarenkörbe validieren Artikel, Mengen und Beilagen vor dem Transaktionsbeginn. UUID-Schreibweisen werden vereinheitlicht; doppelte Artikel oder Beilagen werden abgelehnt.
- Bildschirm- und Lagerbefehlspfade akzeptieren nur formal gültige Ressourcenkennungen. Ungültige Pfade erreichen keine PostgreSQL-UUID-Konvertierung.
- Installerübertragungen schließen bei einem fehlerhaften Quellstream kontrolliert, verlangen einen HTTPS-Ausgangslink und sind zeitlich begrenzt.

### AI-Lager, Lieferscheine und Beschaffung

- Mengen, Preise, Provisionssätze und Rezeptberechnungen lehnen automatische Objekt-/Boolean-/Array-Umwandlungen, ungültige Faktoren und unsichere Summen ab.
- Verbrauch mehrerer Rezeptzeilen wird auch in der Summe begrenzt. Historische negative Buchbestände bleiben in der Planung sichtbar; automatische Beschaffung hält solche Bestände weiterhin zur Prüfung zurück.
- Zu kleine oder ungültige Packungsgrößen können keine Division durch null oder unendliche Kostenschätzungen mehr erzeugen.
- Lieferscheine lehnen null-Zeilen, doppelte Dokumentpositionen und doppelte Rechnungspreiskorrekturen ab. Mehrfach genannte Zutaten werden gemeinsam auf die Bestandsgrenze geprüft.
- Lieferscheinbuchungen/-zuordnungen, historische Preisänderungen, Inventur, Verlustbuchungen und Barcode-Wareneingang prüfen das aktuelle aktive Restaurantkonto unter einer bis zum Commit gehaltenen Sperre.
- Lieferanten-Schlüsseländerungen und Einkaufsdelegationen committen zusammen mit ihrem Audit; ein fehlgeschlagenes Audit hinterlässt keine teilweise erteilte Berechtigung.
- Einkaufsanfragen und Warenkörbe erkennen auch UUID-Duplikate mit unterschiedlicher Großschreibung vor Schreibzugriffen.
- Ein OCR-Worker, der ohne Ergebnis oder mit einem ungültigen Ergebnis endet, gibt die Verarbeitungskapazität wieder frei und lässt die Anfrage nicht dauerhaft hängen.
- Steuerberater-Cursor haben Größen-/Zeichenlimits und prüfen echte Kalenderzeitpunkte, ohne Mikrosekunden zu verlieren.

## Testergebnisse, Ursachen und nächster Fix

| Bereich | Ergebnis | Gefundene Ursache | Fix / nächster Schritt |
| --- | --- | --- | --- |
| Server-/Browser-Unit-Tests | Bestanden: 501/501, keine übersprungen | Grenzfälle bei Eingaben, Rollen und Berechnungen fehlten | Neue Regressionen und vollständiger Gesamtlauf |
| Betriebs-/Preview-Tests | Bestanden: 20/20 | Bestehende Isolations- und Releasegrenzen müssen erhalten bleiben | Gesamtlauf erneut ausgeführt |
| Desktop-Offline-Tests | Bestanden: 37/37 | Bestehende dauerhafte Queue und Replay-Regeln dürfen nicht verändert werden | Gesamtlauf erneut ausgeführt |
| Vollständige AI-Datenbank-/DOM-Integration | Bestanden lokal | Gemeinsame Regeln betreffen Planung, Lager, Bestellungen, Lieferanten und Rechnung | Vollständige Integration erneut erfolgreich |
| Lager-/Inventur-Integration | Bestanden: 36 Szenarien lokal | Testlader kannte neues Berechtigungsmodul nicht | Testimport ergänzt; produktive Sperrprüfung beibehalten |
| Offline-/Steuerberater-Integration | Bestanden: 251 Belege lokal | Neue Cursorprüfung muss vorhandene Seitennavigation erhalten | Bestehende Integration erneut ausgeführt |
| Vollständiger Billing-Webhook | Bestanden lokal mit eingebettetem PostgreSQL | Freischaltung ohne vollständigen Zahlungsabgleich; fehlender Schutz der erstmaligen Folgezahlung | Echter Routencode gegen Datenbank, Fehler-Rollback, Replay und Preisbindung geprüft |
| Billing-Webhook, PostgreSQL 16 | Bestanden | Gleichzeitige erstmalige Beobachtung derselben Zahlung | Fünf gleichzeitige Benachrichtigungen, genau eine Rechnung/Zugangs-/Mailbuchung |
| Sperre gegen Lagerzugriff, PostgreSQL 16 | Bestanden | Kontosperre konnte nach vorgelagerter Authentifizierung erfolgen | Tatsächliche Row-Lock-Wartezustände in beiden Ausführungsreihenfolgen geprüft |
| Vollständige POS-/AI-CI | Bestanden | Breite Änderungen benötigen gemeinsamen Abschlusslauf | Vorhandene Kassen-, Tisch-, Admin-, Personal-, Kellner-, Center-, Offline- und AI-Szenarien |
| Isolierter echter HTTP-/HTTPS-Browserstack | Bestanden | Unit-Tests allein beweisen keine kontrollierten HTTP-Fehler | Zusätzliche verschachtelte Null-Zeilen auf realen POS-/AI-Routen; Browser, gesperrte Provider, Backup/Restore |
| Center Chromium und WebKit | Bestanden | Shared Reader und Providerbeträge dürfen Center nicht beschädigen | Bestehende Browser- und PostgreSQL-Gruppen |
| Electron Cloud-Sync | Bestanden am relevanten vorherigen Codecheckpoint | Bestehende native Wiederverbindung muss erhalten bleiben | CI 39013558004 erfolgreich; danach keine Desktop-/Sync-Codeänderung |
| Minusbestandsregression im Zwischenstand | Fehlgeschlagen, behoben | Neue Eingabeprüfung lehnte auch bestehende historische Minusbestände ab | Sichtbarkeit erhalten, fehlerhafte Ziele/automatische Bestellung weiter blockiert; vollständige AI-Integration wieder bestanden |
| Integrationstestimport im Zwischenstand | Fehlgeschlagen, behoben | Data-URL-Testmodul konnte neuen relativen Import nicht auflösen | Testlader ergänzt; alle 36 Szenarien lokal wieder bestanden |
| Produktive Geräte-/Providerabnahme | Offen | Externe Geräte, Credentials, Lieferantenfreigaben und Releaseentscheidungen | Nicht als durch automatisierte Entwicklung erledigt dargestellt |

## GitHub-CI-Nachweise

- [Bringness checks](https://github.com/akanal/Bringness-POS/actions/runs/39013669436) – bestanden für `1f455b8`.
- [POS release validation](https://github.com/akanal/Bringness-POS/actions/runs/39013669440) – bestanden für `1f455b8`.
- [Center validation](https://github.com/akanal/Bringness-POS/actions/runs/39013669366) – bestanden für `1f455b8`.
- [POS and AI completion validation](https://github.com/akanal/Bringness-POS/actions/runs/39013669359) – bestanden für `1f455b8`.
- [Isolated POS AI preview validation](https://github.com/akanal/Bringness-POS/actions/runs/39013669437) – bestanden für `1f455b8`.
- [Electron cloud sync recovery](https://github.com/akanal/Bringness-POS/actions/runs/39013558004) – bestanden für `64559f1`; danach keine Desktop-/Sync-Codeänderung.

Die Provider in der neuen Billing-Suite sind ausschließlich simuliert. Die SQL-Transaktionen und Konkurrenztests laufen gegen eine eigene temporäre PostgreSQL-16-Teststruktur. Sie verändern keine Kunden-/Produktionsdaten. Browser-/Containerprüfungen verwenden synthetische Vorschaukonten.

## Externe Restpunkte

- Dauerhaftes Netcup-Staging mit eigener Hostabnahme, DNS/TLS und freigegebener Bereitstellung.
- Echte TSE-/DSFinV-K-/Mollie-Abnahme; keine Zertifizierung aus simulierten Anbieterantworten ableiten.
- Hardware-TSE-SDK und physische Geräte, Drucker, Zahlungsterminals sowie reale Handy-/Standby-Prüfungen.
- Windows-Organisationszertifikat und signierte Releaseabnahme. Erfolgreiche CI-Testartefakte ersetzen keine signierte Kundenfreigabe.
- Endgültige offene Modulpreise und sonstige geschäftliche Entscheidungen bleiben unverändert offen.

Die bestehenden GitHub-Issues wurden geprüft. Externe Release-Gates und bereits erledigte Teilaufgaben wurden nicht allein aufgrund dieses Entwicklungsblocks als insgesamt abgeschlossen markiert.

## Weitere 50 Commits

| Nr. | GitHub-Commit | Änderung |
| --- | --- | --- |
| 1 | [f92012d](https://github.com/akanal/Bringness-POS/commit/f92012d5ccaae078175f285556933f84a9283ee6) | fix(stock): reject malformed lifecycle request bodies before writes |
| 2 | [2d8ed5a](https://github.com/akanal/Bringness-POS/commit/2d8ed5a2d78568a48247bb378e70459f302e430f) | fix(owners): bound legacy guest and owner request bodies |
| 3 | [7bcc2aa](https://github.com/akanal/Bringness-POS/commit/7bcc2aaa72536943335618298e760f24622a8c4b) | fix(auth): apply password-reset gate to legacy owner APIs |
| 4 | [dcc7cf2](https://github.com/akanal/Bringness-POS/commit/dcc7cf223c0c1a49fe687c76119cfb21b56c2456) | fix(tables): enforce assigned-waiter scope on detail reads |
| 5 | [d4d1b95](https://github.com/akanal/Bringness-POS/commit/d4d1b95827512047510271c511ce1e9aec6a6b1f) | fix(personnel): retire legacy handset attendance mutation bypass |
| 6 | [375efab](https://github.com/akanal/Bringness-POS/commit/375efab54bd41ddcb07d62943be56b1b98d5f8f7) | fix(admin): validate bounded AI gateway payloads before forwarding |
| 7 | [c214ee3](https://github.com/akanal/Bringness-POS/commit/c214ee326f41fe130da2b49bca8832f524afe913) | fix(fiscal): safely decode and bound TEST credential requests |
| 8 | [53da452](https://github.com/akanal/Bringness-POS/commit/53da452e63b73319bf71a46ab448a6280fd0b321) | fix(center): preserve controlled oversized webhook responses |
| 9 | [f0ecd84](https://github.com/akanal/Bringness-POS/commit/f0ecd84ffb57ee145a645f4ba62c3ceddee34497) | fix(owners): reject malformed resource IDs before SQL casts |
| 10 | [f90b266](https://github.com/akanal/Bringness-POS/commit/f90b266db8360dde1715e6f3922b62a60e633e56) | fix(qr): validate legacy guest cart identities and quantities before transactions |
| 11 | [58d06b3](https://github.com/akanal/Bringness-POS/commit/58d06b381bd2c2d0e8b8890565626c31cd1a0f61) | fix(payments): parse provider euro amounts without floating-point rounding |
| 12 | [b80e395](https://github.com/akanal/Bringness-POS/commit/b80e395b70456de87dffb81c897fbd9c798ace53) | fix(billing): bound webhook payloads and reject ambiguous payment IDs |
| 13 | [8926d9a](https://github.com/akanal/Bringness-POS/commit/8926d9a9d2d3c2f155c8569a468d0abd782a0370) | fix(billing): verify provider amount and contract before granting access |
| 14 | [fa10251](https://github.com/akanal/Bringness-POS/commit/fa10251565ff38aaa9882b65f84052a03dac2a96) | fix(billing): bind recurring invoices to existing paid subscription contracts |
| 15 | [927f7af](https://github.com/akanal/Bringness-POS/commit/927f7afe9872ca00f2c1c5fbe8fc61bbcbdf54c8) | fix(billing): bound Mollie requests and prevent credential redirects |
| 16 | [e33402e](https://github.com/akanal/Bringness-POS/commit/e33402e097e5a1aef951e8d6908bb6e02b32c857) | fix(billing): suppress reminders for malformed provider amounts |
| 17 | [0058247](https://github.com/akanal/Bringness-POS/commit/0058247f4b20564d0ce25a534549049da46ee15b) | fix(billing): compute VAT with integer arithmetic and cap booked totals |
| 18 | [9663c6c](https://github.com/akanal/Bringness-POS/commit/9663c6c0cd135d17787eb779f744ef56f8c4d241) | fix(billing): restrict private contract status to current owner sessions |
| 19 | [7e48b83](https://github.com/akanal/Bringness-POS/commit/7e48b832fb0821f3f24381b05cbddc64e9216780) | fix(downloads): deny password-gated accounts before license access |
| 20 | [c5364c1](https://github.com/akanal/Bringness-POS/commit/c5364c172acb606b6c8c09df358b00bbc6063128) | fix(ai): reject coerced quantities and prices in shared input policy |
| 21 | [9fd6173](https://github.com/akanal/Bringness-POS/commit/9fd6173d252be2ec967a85ae5744c7599693c028) | fix(ai): reject invalid commission rates before order calculation |
| 22 | [a219928](https://github.com/akanal/Bringness-POS/commit/a219928e93338eb75a1ba2624ee666186a7a7f7e) | fix(stock): reject coerced values in lifecycle quantity validation |
| 23 | [0ee920c](https://github.com/akanal/Bringness-POS/commit/0ee920caf4a069095f0052234d220272ab17cfd7) | fix(stock): cap combined ingredient demand before stock mutation |
| 24 | [1cbcc66](https://github.com/akanal/Bringness-POS/commit/1cbcc666ed8337b714d2ed808e3207eba185b681) | fix(procurement): reject invalid stock foundations before replenishment planning |
| 25 | [7ed6234](https://github.com/akanal/Bringness-POS/commit/7ed62347d504b55c7629333c2e7bba3ef923ff2f) | fix(ai): guard recipe calculations against invalid factors and unsafe totals |
| 26 | [ccc97da](https://github.com/akanal/Bringness-POS/commit/ccc97dac21322d8a1acbefb5421251c70d242e20) | fix(procurement): prevent zero-sized pack division and unsafe cost estimates |
| 27 | [d9f4607](https://github.com/akanal/Bringness-POS/commit/d9f460711fa9e2bfa004356b0a4b3924ca055cec) | fix(delivery): reject duplicate document positions and coerced pack quantities |
| 28 | [67b2b44](https://github.com/akanal/Bringness-POS/commit/67b2b44643bc2aa217ff4bd20c8cc9d2ff7f744e) | fix(delivery): enforce cumulative stock limits for repeated ingredients |
| 29 | [cc38937](https://github.com/akanal/Bringness-POS/commit/cc3893753c2b10b0015c314adcbac7149b9977e1) | fix(delivery): recheck active restaurant under stock transaction lock |
| 30 | [61471c0](https://github.com/akanal/Bringness-POS/commit/61471c039517338e525bfb11091cf04018889b80) | fix(inventory): prevent suspended-account count and loss transactions |
| 31 | [9dd0c78](https://github.com/akanal/Bringness-POS/commit/9dd0c78c851de5efaede1f6abd038055fa5eb2a7) | fix(procurement): retain negative legacy stock visibility without permitting invalid targets |
| 32 | [2530e3c](https://github.com/akanal/Bringness-POS/commit/2530e3c3d8f342aebbf3c08707f1e9d3414b91e4) | fix(barcodes): recheck receipt authority and stock bounds transactionally |
| 33 | [47acf6d](https://github.com/akanal/Bringness-POS/commit/47acf6dadb9bea7a6eec8a34d59bfed6dc049335) | fix(procurement): canonicalize cart identities and reject malformed duplicate lines |
| 34 | [b6f890c](https://github.com/akanal/Bringness-POS/commit/b6f890c8d1a4308cac4d41dff19b8371a12f35bd) | fix(suppliers): transact connector key changes with current authority and audit |
| 35 | [318b6ec](https://github.com/akanal/Bringness-POS/commit/318b6ec17571b029f07246ecaacaa15396fbaa82) | fix(planning): commit delegated purchase permission and audit atomically |
| 36 | [ff1767a](https://github.com/akanal/Bringness-POS/commit/ff1767aebd26ef28a3dcc3551f1cd3a5618eafa9) | fix(planning): validate canonical purchase requests before acquiring write locks |
| 37 | [caad661](https://github.com/akanal/Bringness-POS/commit/caad66126525f1abe52bb57415aeb63002459394) | fix(ocr): release worker capacity after silent exit and malformed results |
| 38 | [5f44d8b](https://github.com/akanal/Bringness-POS/commit/5f44d8b97a6b4070a509266a61b3275d46382fd9) | fix(accountant): bound cursor decoding and reject impossible timestamps |
| 39 | [8fec33a](https://github.com/akanal/Bringness-POS/commit/8fec33aa044565dd1f9db68b6c00b76db28230cf) | fix(displays): require canonical screen and public media path IDs |
| 40 | [5030e8f](https://github.com/akanal/Bringness-POS/commit/5030e8f131a4bf4e75d4ade0243dd2724cfb2760) | fix(stock): reject malformed command polling IDs before database access |
| 41 | [7b9783a](https://github.com/akanal/Bringness-POS/commit/7b9783a71395041cbec9a7da059f8ad1e37bff24) | fix(delivery): validate unique invoice price corrections before a transaction |
| 42 | [da0b739](https://github.com/akanal/Bringness-POS/commit/da0b739a964c26fbc9e95123c294225e257eefda) | fix(downloads): safely close failed installer streams and bound transfers |
| 43 | [536f969](https://github.com/akanal/Bringness-POS/commit/536f9693f555d0fd4074746890406346d4855c6b) | fix(billing): prevent stale provider reads from downgrading paid transactions |
| 44 | [be464f1](https://github.com/akanal/Bringness-POS/commit/be464f16ed2a653f9ad96e2572d5900a8ad67882) | fix(billing): serialize first observation of recurring payment webhooks |
| 45 | [77d4309](https://github.com/akanal/Bringness-POS/commit/77d430977c791ad5fc87a550d42f4a66aa6eee67) | test(billing): verify full webhook transactions and concurrent recurring notifications |
| 46 | [64559f1](https://github.com/akanal/Bringness-POS/commit/64559f172e124a41e053a2f65ecebb64a0cec274) | test(stock): observe real PostgreSQL suspension ordering under account locks |
| 47 | [e75d903](https://github.com/akanal/Bringness-POS/commit/e75d9034b41a903121b5e40820a92f6204e45c90) | test(preview): exercise malformed nested POS AI inputs through actual HTTP routes |
| 48 | [b323f24](https://github.com/akanal/Bringness-POS/commit/b323f24dd6e5a06c4b00821abcc3c6a87df35c5e) | fix(delivery): recheck current authority before historical price corrections |
| 49 | [1f455b8](https://github.com/akanal/Bringness-POS/commit/1f455b897961aaa6a35de0a1c0bdcb5b8221c42e) | fix(billing): verify subscription acknowledgements and complete recovery regressions |
| 50 | dieser Dokumentationscommit | Ergebnisse, Fehlerursachen, CI-Nachweise und verbleibende Grenzen |

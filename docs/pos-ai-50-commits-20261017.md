# Bringness POS / AI – Entwicklungs- und Testbericht 2026-10-17

Arbeitsblock: 50 zusammenhängende GitHub-Commits auf `staging/preview-20261016`.
Ausgangsstand: `d03b1bd56a6e6d4a7f6e9db1450176184ce08433`. Kein Merge nach main und kein Deployment.
49 Implementierungs-/Testcommits; Commit 50 dokumentiert das geprüfte Ergebnis.
Der bestehende Projektstand und die Entscheidungen in AGENTS.md wurden berücksichtigt.
Bereits vorhandene Offline-, Zahlungs- und Personalabläufe wurden weiterverwendet und erneut geprüft.

## Tatsächlich fertiggestellte Änderungen

- Gemeinsamer begrenzter JSON-/Byte-Reader für POS, AI und die betroffenen Verwaltungs-, Offline-, Kassen-, Tisch-, Personal-, Support- und Display-Routen. Null, Arrays, Skalare, ungültiges UTF-8 und übergroße Inhalte werden kontrolliert abgelehnt.
- Asynchrone Passwort-/PIN-Ableitung mit begrenzter Warteschlange. Bestehende Hashformate bleiben kompatibel; öffentliche Anfragen blockieren den JavaScript-Thread nicht durch synchrone scrypt-Aufrufe.
- POS- und AI-Sitzungen werden erst nach erneuter transaktionaler Prüfung von Kontostatus, Rolle und Passwortstand ausgegeben. Gleichzeitige Passwortänderung bzw. Kontosperre ist mit echten PostgreSQL-Zeilensperren geprüft.
- Begrenzter Loginversuchsspeicher ohne Verdrängung aktiver Sperren, höchstens zwei parallele POS-Anmeldeversuche pro Identität und korrekte Behandlung interner Fehler ohne falsche Fehlversuchszählung.
- Display-Uploads prüfen grundlegende Dateisignaturen; Playlist-Einträge und Medien-IDs werden validiert. Medienabrufe behandeln Bytebereiche, HEAD und If-Range kontrolliert.
- Wetterimport prüft KMZ-CRC32 und Verschlüsselungsflags. Cache/Parallelität, Tageswechsel, veraltete Ausgaben und Fehlerbereinigung sind abgesichert.
- Steuerberaterexport behält PostgreSQL-Mikrosekunden in Sortierung, Zeitmarke und Folgeseitenkennung bei. Owner- und Steuerberateroberfläche lehnen doppelte oder widersprüchliche Exportseiten ab. Exportmetadaten behalten den beim Start gewählten Zeitraum.
- CSV-Downloads neutralisieren Tabellenformeln auch hinter führenden Leer-/Steuerzeichen. Belegtexte, Anführungszeichen und JSON-Daten bleiben erhalten.

## Testmatrix

| Bereich | Ergebnis | Ursache des zuvor gefundenen Fehlers / Risiko | Umgesetzter Fix / nächster Schritt |
| --- | --- | --- | --- |
| Lokale Server- und Browser-Unit-Tests | Bestanden: 460/460 | Mehrere Request- und Sicherheitsgrenzen waren nicht einheitlich geprüft | Gemeinsame Reader, Ableitungs-, Login-, Wetter-, Medien- und Exportregressionen |
| Betriebs-/Preview-Tests | Bestanden: 20/20 | Schutz- und Wiederherstellungsgrenzen müssen erhalten bleiben | Bestehende Testgruppe erneut erfolgreich |
| Desktop-Offline-Tests | Bestanden: 37/37 | Wiederholung nach Verbindungsabbruch darf keine zweite Buchung erzeugen | Bestehende dauerhafte Queue-, Replay- und Bestätigungsprüfungen erneut erfolgreich |
| Offline-Sync und Steuerberater, lokale Integration | Bestanden: 251 Belege | Mandantentrennung und Wiederholung sind finanzkritisch | Vorhandene Integration erneut ausgeführt |
| Owner-/Steuerberater-Exportoberflächen | Bestanden | Formelpräfixe, doppelte Seiten, wechselnder Datenstand und geänderter Zeitraum während Download | Tatsächliche Clients mit JSDOM geprüft; fehlerhafte Exporte bleiben gesperrt |
| POS-/AI-Login gegen Passwortwechsel/Kontosperre | Bestanden | Konto konnte sich zwischen Passwortprüfung und Sitzungsausgabe ändern | Erneute Prüfung unter FOR SHARE; PostgreSQL-16-Racetests |
| Steuerberater-Mikrosekundenexport | Bestanden | JavaScript-Date verlor SQL-Mikrosekunden: Cursor konnte Belege erneut liefern | SQL-Zeitstrings; 301 Belege über mehrere Seiten, vollständige ID-Reihenfolge, spätere Belege ausgeschlossen, Widerruf |
| Neuer PostgreSQL-Test beim ersten Lauf | Fehlgeschlagen, behoben | Deterministische MD5-Test-UUIDs erfüllten nicht immer die produktive UUID-Prüfung; Folgeseite wurde 400 | Testdaten auf kanonische UUIDs korrigiert; produktive Prüfung bleibt bestehen |
| Kassenabschluss / Tischabrechnung | Bestanden | Antwortverlust, gleichzeitige Wiederholung, veraltete Snapshots | Bestehende echte PostgreSQL-Tests: genau eine Buchung, Rollback, spätere Tischbestellungen bleiben offen |
| Admin-, Personal- und Kellnerzugang | Bestanden | Änderungen an Hashing und Request-Verarbeitung dürfen bestehende Rollen-/Resetabläufe nicht brechen | Vollständige vorhandene Integration erneut ausgeführt |
| Bringness AI: Bestand, Beschaffung, Planung, Abrechnung | Bestanden | Änderungen am gemeinsamen Eingabe- und Loginpfad | Vollständige AI-Integration einschließlich konkurrierender PostgreSQL-Worker |
| Isolierter echter POS-/AI-Stack | Bestanden | Rein lokale Unit-Tests beweisen keinen HTTP-/Browserbetrieb | Temporäre Container, synthetische Daten, echte HTTP-/HTTPS-Browseranmeldung, negative API-Eingaben, externe Provider gesperrt, verschlüsseltes Backup/Restore |
| Center | Bestanden am relevanten vorherigen Codecheckpoint | Gemeinsamer Reader darf bestehende Datenbank-/Browserabläufe nicht verändern | CI 39011794248: beide Engines erfolgreich |
| Produktions-/Hardwareabnahme | Offen, nicht ausgeführt | Externe Zugänge, Geräte, echte Provider und separate Freigaben erforderlich | Siehe verbleibende Grenzen |

## CI-Nachweise

- [POS release validation](https://github.com/akanal/Bringness-POS/actions/runs/39012285460) – bestanden.
- [Bringness checks](https://github.com/akanal/Bringness-POS/actions/runs/39012285564) – bestanden.
- [Demo smoke tests](https://github.com/akanal/Bringness-POS/actions/runs/39012285459) – bestanden.
- [Isolated POS AI preview validation](https://github.com/akanal/Bringness-POS/actions/runs/39012285477) – bestanden.
- [POS and AI completion validation](https://github.com/akanal/Bringness-POS/actions/runs/39012285513) – bestanden.
- [Staging preview preflight](https://github.com/akanal/Bringness-POS/actions/runs/39012285439) – bestanden.

## Verbleibende Grenzen und nächster Fix

1. **Staging-Hosting:** Der isolierte Stack ist in CI geprüft. Eine dauerhaft erreichbare Netcup-Staging-Instanz, DNS/TLS und deren Hostabnahme sind damit nicht erledigt. Die bestehende Produktionsautomation bleibt erhalten und wurde nicht ausgelöst. Siehe [Staging-Status](staging-provisioning-status.md).
2. **TSE / DSFinV-K / Zahlungen:** Reale Provider- und Fiskalabnahme, Hardware-SDK/physische Geräte und ein zertifizierter offizieller Export bleiben externe Release-Gates. Simulierte Providerprüfungen und interne JSON-Prüfpakete sind keine Zertifizierung. Kein ungeprüftes Kartenzahlungs- oder Fiskalverhalten wurde live geschaltet.
3. **Geräteprüfung:** Reale Drucker, Kassenhardware, Terminals und länger andauernde Offline-/Wiederverbindungstests auf den Zielgeräten bleiben erforderlich.
4. **Exportgrenze:** Die Zeitmarke begrenzt neu aufgezeichnete Belege. Sie ist kein über mehrere HTTP-Anfragen gehaltener PostgreSQL-Repeatable-Read-Snapshot. Der interne Export wird weiterhin ausdrücklich nicht als offizieller DSFinV-K-Export bezeichnet.
5. **Medienprüfung:** Dateisignaturen sind geprüft; vollständige Codec-/Decoder-, Viren- oder Inhaltsprüfung ist damit nicht implementiert.
6. **Preisentscheidungen:** Bestehende bestätigte Preise bleiben erhalten; offene Modulpreise wurden nicht erfunden.

Es besteht nach den unten verlinkten erfolgreichen Läufen kein bekannter fehlgeschlagener automatisierter Check dieses Codecheckpoints. Vollständige Produktionsfertigstellung wird wegen der genannten externen Gates nicht behauptet.

## Commitnachweis

| Nr. | GitHub-Commit | Änderung |
| --- | --- | --- |
| 1 | [7a3a6fb](https://github.com/akanal/Bringness-POS/commit/7a3a6fbed23458b0ac38fd6a8e7464f92ce79d51) | fix(http): bound and validate object request bodies without corrupting UTF-8 |
| 2 | [290553e](https://github.com/akanal/Bringness-POS/commit/290553e1991a3691ae3c0c2ce31af785d021ae17) | fix(pos): bound public authentication payloads and return safe input errors |
| 3 | [051916f](https://github.com/akanal/Bringness-POS/commit/051916fce4c63455411aba6b6cf80fb410a3d311) | fix(http): preserve bounded parsing for legacy event-stream adapters |
| 4 | [ee25d89](https://github.com/akanal/Bringness-POS/commit/ee25d89c4d0e91b4783c7cac10534e13dbd8162e) | fix(center): reject non-object requests and preserve streamed guest text |
| 5 | [67ac7b6](https://github.com/akanal/Bringness-POS/commit/67ac7b6eed81166e3ff8682e05f853b54d9d51f7) | fix(qr): validate management payloads before changing service modes |
| 6 | [ae5cd0a](https://github.com/akanal/Bringness-POS/commit/ae5cd0ad8b4f30d6c245891ad53da580d6e42f88) | fix(checkout): share strict byte-bounded payment request decoding |
| 7 | [01ead7c](https://github.com/akanal/Bringness-POS/commit/01ead7cce30d40a36b84b6be0cb3eaf80622ba9d) | fix(settlement): reject malformed UTF-8 before financial transactions |
| 8 | [2a9cb0a](https://github.com/akanal/Bringness-POS/commit/2a9cb0a67c263cc300ea366403edc8cd2f189511) | fix(offline): enforce actual byte limits for catalog and batch imports |
| 9 | [4a0398b](https://github.com/akanal/Bringness-POS/commit/4a0398b3057b63cebfb74e9314ad4b3008c9f86b) | fix(accountant): bound and strictly decode grant management requests |
| 10 | [0267eba](https://github.com/akanal/Bringness-POS/commit/0267eba3d95bc549e2c97df682249fc61dfdac02) | fix(auth): reject scalar and null password recovery payloads safely |
| 11 | [b9bf801](https://github.com/akanal/Bringness-POS/commit/b9bf801d0c9a4f092e75030da5a603f960939770) | fix(admin): validate staff administration input objects before use |
| 12 | [3d8b7e2](https://github.com/akanal/Bringness-POS/commit/3d8b7e25fe01fa99877bbc4a05ab3b92435af386) | fix(personnel): preserve UTF-8 and enforce byte limits for protected actions |
| 13 | [d0f550c](https://github.com/akanal/Bringness-POS/commit/d0f550c6703af6a61447073d0547baad45f6bb09) | fix(scheduling): validate request objects before duty changes |
| 14 | [36ac368](https://github.com/akanal/Bringness-POS/commit/36ac368b7acc8d06bd5c89984d6bd6c73ec6a6a3) | fix(waiter): bound request bytes without corrupting kitchen notes |
| 15 | [6fc0b2b](https://github.com/akanal/Bringness-POS/commit/6fc0b2be269acd3e90e2a2ed914254e0ae9bfe90) | fix(staff): validate invitation acceptance request objects |
| 16 | [79cc8ce](https://github.com/akanal/Bringness-POS/commit/79cc8ceb6d2f9efe18ff374661a60eb13ca3ca2a) | fix(staff): reject malformed reset and profile lifecycle payloads |
| 17 | [9b67c7e](https://github.com/akanal/Bringness-POS/commit/9b67c7e7d5087beb24e4f977ddbd63d1b18776f2) | fix(billing): validate platform contract request shapes and byte limits |
| 18 | [427532d](https://github.com/akanal/Bringness-POS/commit/427532d94e9b0537e1b74cfdbcdfe31217cda632) | fix(platform): reject invalid control request objects before dispatch |
| 19 | [de25fc7](https://github.com/akanal/Bringness-POS/commit/de25fc79ede7bf0ae8b347cac094a818f19077b0) | fix(support): bound and preserve customer message request text |
| 20 | [e76c4a5](https://github.com/akanal/Bringness-POS/commit/e76c4a5b4a6a3f5e1e005f2212778c4f7167ee0f) | fix(licensing): use consistent strict device request decoding |
| 21 | [4375c22](https://github.com/akanal/Bringness-POS/commit/4375c2258ebcda4c949eed53f57e45fdfcaff1e7) | fix(ai): validate bounded object requests across inventory and supplier APIs |
| 22 | [03d176d](https://github.com/akanal/Bringness-POS/commit/03d176dfea09f1fa19c309a7286c8b498622e49d) | feat(auth): bound asynchronous credential derivation while retaining existing hash formats |
| 23 | [ae159b5](https://github.com/akanal/Bringness-POS/commit/ae159b53b4b1ecc362a215ddd08748b097edbed0) | perf(auth): move POS login and account hashing off the server event loop |
| 24 | [eb41b7c](https://github.com/akanal/Bringness-POS/commit/eb41b7c043d965258583d98b59e2abfd1cfaa255) | perf(recovery): derive changed passwords asynchronously with compatible hashes |
| 25 | [3faba0a](https://github.com/akanal/Bringness-POS/commit/3faba0a7e4ec45547b86bf219cbed76da06cfc00) | perf(admin): bound credential work during employee and administrator creation |
| 26 | [4c36fcd](https://github.com/akanal/Bringness-POS/commit/4c36fcd23cc0c2fa565d8d216b2bbc28ed2a68d8) | perf(personnel): asynchronously verify and create protected PIN credentials |
| 27 | [23f88e4](https://github.com/akanal/Bringness-POS/commit/23f88e46bcbd8b39f7f06ef3b84b7421270f170f) | perf(staff): avoid blocking POS requests during invitation credential creation |
| 28 | [e8900cc](https://github.com/akanal/Bringness-POS/commit/e8900cc951919de98cb85678f6334c1034310e93) | perf(staff): use bounded async hashing for activation and anonymized accounts |
| 29 | [9eeeb7a](https://github.com/akanal/Bringness-POS/commit/9eeeb7a376148e84368d617d6f67d88a8b554a4d) | perf(waiter): move password and stamping PIN recovery off the event loop |
| 30 | [380c9d2](https://github.com/akanal/Bringness-POS/commit/380c9d2e40d8c252ba30d374bc9849794cc14c66) | perf(ai): asynchronously derive salted account credentials without format migration |
| 31 | [5317380](https://github.com/akanal/Bringness-POS/commit/5317380d1a0a9cd5072586cc17ab35f9ca41ed4b) | fix(runtime): return safe client errors consistently across modular POS routes |
| 32 | [5dd7dcf](https://github.com/akanal/Bringness-POS/commit/5dd7dcf485515b531b2e80970914520ed32fcb61) | fix(auth): serialize POS session creation with credential changes and suspension |
| 33 | [0896a46](https://github.com/akanal/Bringness-POS/commit/0896a4647ccb819ed95aa6c3a17b40f20cd8cda5) | fix(ai): recheck current account credentials before issuing login sessions |
| 34 | [cecec40](https://github.com/akanal/Bringness-POS/commit/cecec40a4a4ec019a519cebd51311b309ba767cc) | test(auth): verify real PostgreSQL races between login, reset and suspension |
| 35 | [88d8575](https://github.com/akanal/Bringness-POS/commit/88d8575f5b9256f33938b821aee0da1519397840) | fix(auth): bound login limiter memory without evicting active account blocks |
| 36 | [f4ed38a](https://github.com/akanal/Bringness-POS/commit/f4ed38a3de9aa1691f79a2e8740c1b3a3c05a61c) | fix(auth): bound parallel account logins and count only verified credential failures |
| 37 | [8ecce17](https://github.com/akanal/Bringness-POS/commit/8ecce1737e90670e8fa15e74521f46eb1cc02477) | fix(displays): consistently bound binary uploads and validate editor request objects |
| 38 | [d6afa6e](https://github.com/akanal/Bringness-POS/commit/d6afa6e9bf5b2d216e3db2f94d19886afa3608f0) | fix(displays): validate playlist item shapes and canonical media identifiers |
| 39 | [4cac053](https://github.com/akanal/Bringness-POS/commit/4cac053bc82871eb7dd84a1924341c08f62ddad0) | fix(displays): verify uploaded media signatures before persistent storage |
| 40 | [f20f67f](https://github.com/akanal/Bringness-POS/commit/f20f67f13da40899fb14da5323b72555b836400f) | fix(displays): serve bounded byte ranges and safe media HEAD responses |
| 41 | [373177d](https://github.com/akanal/Bringness-POS/commit/373177d52ac360e222ffd149b0a0cb004dd078ca) | fix(support): validate remote assistance objects before command and frame processing |
| 42 | [c100810](https://github.com/akanal/Bringness-POS/commit/c100810922d219afc7d9e4333d1af73a58c9bbae) | fix(qr): reject malformed public notification payloads before order lookup |
| 43 | [a5aa0f9](https://github.com/akanal/Bringness-POS/commit/a5aa0f9532a0d53418c541f677497da17fe32058) | fix(weather): verify KMZ data checksums before applying forecast measurements |
| 44 | [01c6018](https://github.com/akanal/Bringness-POS/commit/01c601815e5414fd508a3a5108223e5a60f0a7c4) | fix(weather): expire stale day forecasts and bound concurrent station downloads |
| 45 | [9bb0963](https://github.com/akanal/Bringness-POS/commit/9bb09634df56f40b9072aa71bbdcf4fb5c8d427a) | fix(accountant): retain PostgreSQL timestamp precision across export pages |
| 46 | [683f7d5](https://github.com/akanal/Bringness-POS/commit/683f7d5aa0787b2dd15bf7215e7503c5a9240c1f) | test(accountant): verify microsecond export pagination against PostgreSQL 16 |
| 47 | [1d6f13e](https://github.com/akanal/Bringness-POS/commit/1d6f13e7682c91ada23f922752079c2e238180c8) | fix(exports): neutralize spreadsheet formula prefixes after leading whitespace |
| 48 | [9a6b559](https://github.com/akanal/Bringness-POS/commit/9a6b559d73aa7ffb633384f1491ffb7d671d499b) | fix(accountant): reject inconsistent export pages and retain requested period |
| 49 | [7a9a1bb](https://github.com/akanal/Bringness-POS/commit/7a9a1bbc6bd01045e5f185587336b48ed5702102) | test(pos): validate protected request boundaries and canonical export fixture IDs |
| 50 | dieser Dokumentationscommit | Geprüfte Ergebnisse, Fehlerursachen, CI-Nachweise und verbleibende Release-Gates |

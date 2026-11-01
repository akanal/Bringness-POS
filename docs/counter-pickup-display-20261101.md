# Fixed counter pickup display

Owner request 2026-11-01: dedicated Theke/Abholanzeige, counter ordering QR, matching order numbers, preparation/ready columns, existing handset notification retained.

Implemented on feature/counter-pickup-display:
- Explicit display mode and existing dining-table/counter assignment; content playlists and stable screen links preserved. Requires configured pickup restaurant, existing counter QR and existing ordering/display entitlements. No automatic module purchase or restaurant-mode change.
- Public player receives only short order numbers/readiness, configured counter name and server-rendered ordering QR. No guest request capability, full order UUID, items, prices or customer data. Server-scoped by restaurant and assigned counter. Updates every four seconds.
- Includes QR and staff/POS orders assigned to that counter, including paid orders awaiting collection. A deliberate opt-in can route new tableless POS sales to one display per restaurant, starting at activation. Historical sales, other counters, Center orders and trade invoices are excluded. No checkout/payment mutation is needed.
- Existing kitchen/QR ready action drives the display and existing guest notification. Additional protected display-management queue provides ready and collected actions. Collection preserves orders, receipts and payment status. Closed/cancelled/served orders excluded; queue bounded to last 24 hours/100 oldest records.
- Existing thermal receipt PDF adds the same eight-character order number. A4 trade invoices unchanged.
- Existing open-page audio/vibration and optional supported browser push remain unchanged; no new guarantee of iPhone locked-screen sound.

Local verification: display database/JSDOM lifecycle, cross-counter rejection, invalid assignment, paid-order retention, ready/collected transitions, preserved order count, QR PNG generation, restored editor selection and escaped player output. Existing display persistence/window independence tests and pickup-notify/guest-push regression passed. Focused 36 unit/PDF tests passed without skips with PDFKit/QRCode enabled.

No physical Fire TV or handset test performed. Deployment status must be established separately from code upload/CI. The production counter must be explicitly selected in the editor; no production order/configuration mutated during development.


## Verified release

PR206 merged as 028c43dbb203140774dd63138131b5bee6c7f097. Final feature 2d7be176706b82405b8f0b80083f7b97cf28e6ed passed all nine checks. Native Chromium/WebKit jobs 124861851430/124861851659 each passed seven POS browser tests including actual pickup player QR/landscape/portrait/live readiness/removal. Integration job 124861851340 passed the display/walk-in/notification regressions.

Netcup run 41311512912, job 124862716297 succeeded; authenticated log confirms exact merge revision deployed, Previous container retained, Database backup retained. Fresh public checks: player JS, display editor JS and player CSS return HTTP200 byte-identical to tested sources; player HTML returns200 with pickup-20261101 version (existing server brand-logo injection explains HTML byte difference). No real restaurant mode, screen assignment, orders, handset registration or payments changed during verification. Owner reloads POS, opens Einstellungen > Displaysteuerung, selects Bildschirmfunktion Theke / Abholanzeige and an existing configured pickup counter, then Anzeigen. Optional new tableless POS routing must be explicitly checked. Physical Fire TV/handset test remains owner's next acceptance step.

## Helle Kundenanzeige und Betriebslogo (PR207)

Eigentümer wünscht freundlichen hellen Standardhintergrund statt Schwarz. Auf der Kundenanzeige ausschließlich Name/eigenes Logo des Betriebs; ohne Logo neutrale Darstellung, keine Bringness-Ersatzmarke.

Umgesetzt: Creme-/Mintfläche, gut lesbare Nummernkarten, warme Zubereitungs- und grüne Abholbereit-Kennzeichnung, permanenter Bestell-QR-Bereich. Quer-/Hochformat bleiben unterstützt. Player-Titel und unverbundener Hinweis neutral. Bestehende Betriebslogos werden aus demselben Restaurant wie die Displayzuordnung gelesen; Vorschau verwendet den bestehenden geschützten Branding-Endpunkt. Nur begrenzte PNG/JPEG/WebP-Datenbilder, keine fremden URLs/SVG; defektes Bild wird ausgeblendet. Keine echte Betriebs-/Bildschirm-/Bestell-/Handy-/Zahlungskonfiguration geändert.

Lokal686 allgemeine Tests ohne Fehler/Skips sowie Displaypersistenz, Abhollebenszyklus, Logo-API/Fallback, Vorschauweitergabe und Modul-/PIN-Übergang bestanden. Featureff205c8bd1baf942740ea12b241528e4540a3c51 bestand alle sechs Workflows: checks41314084513, release41314084446, Farben41314084445, isolated41314084459, Center41314084517, POS/AI41314084443. Native Jobs124870344832/124870345006 jeweils7 POS-Browsertests ohne Fehler. Prüfen Quer/Hochformat, neutrales Fehlen von Logo/Plattformmarke, tatsächliches Betriebslogo, gesperrte externe Logo-URL, QR, Statuswechsel/Entfernung. Vorschauartefakte13086667528/13086289524; Chromium Querformat und Hochformat mit Betriebslogo visuell geprüft.

Backup41314149724 erfolgreich (Database backups validated). PR207 merge5dd7c109cde832ac8ab3a86b9952bf730e8f78a6. Nach Bereitstellung Kasse und bestehende Displayseite im Silk-Browser neu laden; keine neue Adresse oder Displayzuordnung nötig. Die zuvor diskutierten Tresen-/QR-Voraussetzungen werden durch diese reine Darstellungskorrektur nicht automatisch aktiviert oder umgangen.

Netcup41314387636/job124871248227 bestätigt exakt5dd7c109cde832ac8ab3a86b9952bf730e8f78a6 deployed, vorheriger Container und Datenbanksicherung erhalten. Anschließende Live-Prüfung: Player-HTML200 mit neutralem Titel Kundenanzeige und neuer business-pickup-Version; versionierte Player-CSS/JS sowie Displayeditor-JS200 bytegleich mit geprüftem Stand. Keine private reale Displayadresse oder tatsächliches Betriebslogo ausgelesen; Logoabnahme erfolgte mit synthetischem Café-Linden-Logo. Bestehende Displayseite am TV neu laden.


## Pickup persistence repair — PR208
Owner reports preview works but TV retains old media and reopening resets the mode. Source confirms preview changes were unsaved until submit, and save rejected counters with no pre-generated QR. Existing screen mode/counter/walk-in selections now save automatically once complete; failures explicitly retain previous output. Saving creates only a missing same-restaurant counter QR atomically with the display transaction, retaining existing tokens and module/PIN checks. Stale counter-list replies are ignored. Media/playlists and stable display URLs remain intact. POS/superadmin script version bumped for reload.
Local display PGlite/JSDOM lifecycle passed including conversion of an existing content screen, missing QR, same stable player URL, reopen, no QR rotation and denied-module rollback. 34 focused unit checks passed. CI/merge/deployment remain to be confirmed separately. No production configuration, orders or payments modified by local tests.

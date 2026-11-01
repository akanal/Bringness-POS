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

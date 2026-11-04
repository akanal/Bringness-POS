# POS introduction and demo request

Owner requested a public POS demonstration page covering the complete product, rather than leading with the pickup display. `/vorfuehrung/` presents eight areas: cash register/catalogue, tables/QR, waiter orders, kitchen, personnel/planning, receipts/invoices, shifts/reports and displays/pickup. Three accessible example tabs cover sales, service and team operations. A deliberately schematic hero illustrates several areas; no fabricated screenshot or customer endorsement is used.

The existing POS product homepage links to the new page. The POS domain keeps this exact public directory and its assets on bringness-pos.de, while legacy operational pages and callbacks retain their existing routing. Marketplace hosting and POS application screens are unchanged.

Request fields prepare a client-side email draft addressed to the existing public info@bringness.de contact. Users explicitly review and send through their own mail client; there is no server submission, automatic email, booking, local storage, tracker or new marketing subscription. The page describes this behavior. Existing interactive local-fixture demo remains separately linked. The offer does not promise free pilots, approved production TSE, a completed Center rollout or included optional modules.

Validation: JavaScript syntax, root unit suite and public-host routing; native browser test loads the actual three assets at 390/1280 widths, checks all eight areas, responsive overflow, tabs, invalid-email handling and encoded mail-draft generation without API requests or page errors. Native Chrome manual review confirms team-tab content and draft generation. CI and final deployment evidence are recorded after publication.

## Verified release

- Feature PR222, head0436dd3e70586d352ce64649400c08c3cfdc0cc0: all five applicable checks passed, including native Chromium/WebKit12 tests per engine and390/1280 introduction previews. Local689 root tests passed.
- Exact static-dispatcher follow-up PR223, final head08970975605b1965cdc50f46d7b8ef0ced15d131: all six workflows succeeded (checks41828005238, release41828005248, isolated41828005243, Center41828005273, POS/AI41828005472, Shop41828005221). Actual route regression failed before correction;690 local unit tests then passed. Both /vorfuehrung/ and the linked /demo/ directory resolve through the real production dispatcher. Shop includes actual PostgreSQL/server/browser smoke.
- Fresh backup41826851796/job126563666040 confirmed Database backups validated. Final merge71cbdba5618de229f0ce17a4147f6737a6238c22 exactly deployed through Netcup41829052735/job126571175902, with previous container and database backup retained.
- Public checks: canonical https://bringness-pos.de/vorfuehrung/200 stays on POS domain; CSS/JS200 match checked source byte-for-byte; POS homepage200 links to the page; https://bringness.de/demo/200; marketplace root200. Native Chrome opened the canonical production URL and confirmed all eight areas. Synthetic local-browser form test generated the encoded email draft; no actual email, sales, payment or production business fixture was created.
- The previous Library HTML preview was replaced in place by the same full-system page with embedded CSS/JS (libfile_e84c72469f348191ad15d75477ac7f47, version1).

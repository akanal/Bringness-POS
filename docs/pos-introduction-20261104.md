# POS introduction and demo request

Owner requested a public POS demonstration page covering the complete product, rather than leading with the pickup display. `/vorfuehrung/` presents eight areas: cash register/catalogue, tables/QR, waiter orders, kitchen, personnel/planning, receipts/invoices, shifts/reports and displays/pickup. Three accessible example tabs cover sales, service and team operations. A deliberately schematic hero illustrates several areas; no fabricated screenshot or customer endorsement is used.

The existing POS product homepage links to the new page. The POS domain keeps this exact public directory and its assets on bringness-pos.de, while legacy operational pages and callbacks retain their existing routing. Marketplace hosting and POS application screens are unchanged.

Request fields prepare a client-side email draft addressed to the existing public info@bringness.de contact. Users explicitly review and send through their own mail client; there is no server submission, automatic email, booking, local storage, tracker or new marketing subscription. The page describes this behavior. Existing interactive local-fixture demo remains separately linked. The offer does not promise free pilots, approved production TSE, a completed Center rollout or included optional modules.

Validation: JavaScript syntax, root unit suite and public-host routing; native browser test loads the actual three assets at 390/1280 widths, checks all eight areas, responsive overflow, tabs, invalid-email handling and encoded mail-draft generation without API requests or page errors. Native Chrome manual review confirms team-tab content and draft generation. CI and final deployment evidence are recorded after publication.

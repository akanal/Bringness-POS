# Kellner-Tische nach Bereichen — 12.11.2026

Owner screenshot has three tables named1 (Terrasse, Innen and Bar). Previously the number dominated and the area shared the small secondary line with the balance, making the location easy to miss.

The waiter view now groups assigned tables under explicit area headings. Every tile has the full primary label, for example Terrasse · Tisch1, Innen · Tisch1 and Bar · Tisch1. Table names already beginning with Tisch are retained without duplicating the prefix; missing areas explicitly show Ohne Bereich. Preserve the server-provided relative order within each group and use the first appearance for area order. Existing table UUIDs, assignments, selection, requests, amounts and orders are unchanged.

Use the same label in selected-table/basket text, the open-table heading and QR cards/foreground arrival text. Resolve area from the assigned table UUID or an explicit area in the response; never guess area from a duplicated table name. An older detail response without area falls back to the matching assigned table. Display-only records without a known area retain their original title. All stored label text is escaped before HTML rendering.

Local checks and native Chromium/WebKit acceptance must be recorded after execution. The new DOM regression covers three identical numbers, grouping and order, selection by identity, detail fallback, basket and QR location, missing area and literal markup. The native case uses actual service HTML/JavaScript, verifies390/1280px/no horizontal overflow and saves screenshots before selecting the correct Bar table. No production table, name, assignment, order or payment is modified for testing. No backend, commercial or duty-state behavior changes.

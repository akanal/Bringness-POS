# Marketplace header — 2026-10-28

The owner requested a compact header like the previous layout, using Bringness colors and retaining the remaining page. This branch builds on draft PR #167.

Only marketplace.html and its new scoped marketplace-header.css change the UI. Existing search and category inputs move into the green masthead alongside account, orders and merchant links. Navigation and delivery/availability filters occupy the lower row. Original control IDs and form association are retained. Main content was compared against the base and is identical apart from removing the relocated search form. Shared styles, offer/cart/order logic, prices and payment gates remain unchanged.

Validation: 17 focused marketplace/account tests passed. Native Chromium with disposable PGlite passed the connected marketplace journey at 390, 768 and 1280 pixels, including cart, separate merchant orders and tracking recovery. Header screenshots at all three widths had no horizontal overflow; mobile and desktop were visually reviewed. git diff --check passed.

Draft only; no merge, deployment or production changes. IDrive and server configuration remain deferred.

## Live release

Owner requested publication. PR #168 was merged into #167, then #167 into main as 954a9ea2b8f0e466cc36024992ffa7379c0ed674. Merged tree c70b0ceaffb6ea6ddd210f9374e5bf5165a4a88e matches the reviewed header tree. Header head a95f6b70930177686cb827895fc82e0770b87a24 passed Shop40673168795 and isolated-stack40673168568; parent45058 passed all five applicable workflows.

Netcup run40673916496/job122767352977 completed successfully, including deployment tests and authenticated server operation. Logs confirm exact revision954a9ea2 deployed, prior container and database backup retained. Live GET marketplace.html and marketplace-header.css returned HTTP200 and matched reviewed source byte for byte. No production account/order fixtures, payment or IDrive configuration changes. This supersedes the draft-only status above.

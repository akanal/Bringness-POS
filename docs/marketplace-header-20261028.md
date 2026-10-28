# Marketplace header — 2026-10-28

The owner requested a compact header like the previous layout, using Bringness colors and retaining the remaining page. This branch builds on draft PR #167.

Only marketplace.html and its new scoped marketplace-header.css change the UI. Existing search and category inputs move into the green masthead alongside account, orders and merchant links. Navigation and delivery/availability filters occupy the lower row. Original control IDs and form association are retained. Main content was compared against the base and is identical apart from removing the relocated search form. Shared styles, offer/cart/order logic, prices and payment gates remain unchanged.

Validation: 17 focused marketplace/account tests passed. Native Chromium with disposable PGlite passed the connected marketplace journey at 390, 768 and 1280 pixels, including cart, separate merchant orders and tracking recovery. Header screenshots at all three widths had no horizontal overflow; mobile and desktop were visually reviewed. git diff --check passed.

Draft only; no merge, deployment or production changes. IDrive and server configuration remain deferred.

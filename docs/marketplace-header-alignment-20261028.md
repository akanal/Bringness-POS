# Marketplace masthead refinement

Owner requested another dark color, both edges aligned to page content and a working category arrow. The marketplace masthead now uses anthracite and shares the content edges of market-main, with its 28px desktop and 16px mobile gutters. Shared merchant/POS layouts are unchanged.

The native category dropdown uses exact category values from loaded public offers, retaining encountered categories and explicit URL category values. Selecting a category submits the existing search; reset returns to all. This is a selector for loaded offer categories, not a new complete taxonomy/catalog API. The brand arrow remains part of the existing link to /shop/.

18 marketplace/account checks passed, including category selection URL/request/reset and direct category links. Native browser alignment checks passed at390/768/1280/1920 with no horizontal overflow; mobile and desktop screenshots reviewed. Connected marketplace native journey outcome recorded after completion. No prices, payment gates or provider/IDrive configuration changed. User's existing live-release authorization applies to this requested refinement.

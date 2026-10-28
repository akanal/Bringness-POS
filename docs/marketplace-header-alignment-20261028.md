# Marketplace masthead refinement

Owner requested another dark color, both edges aligned to page content and a working category arrow. The marketplace masthead now uses anthracite and shares the content edges of market-main, with its 28px desktop and 16px mobile gutters. Shared merchant/POS layouts are unchanged.

The native category dropdown uses exact category values from loaded public offers, retaining encountered categories and explicit URL category values. Selecting a category submits the existing search; reset returns to all. This is a selector for loaded offer categories, not a new complete taxonomy/catalog API. The brand arrow remains part of the existing link to /shop/.

18 marketplace/account checks passed, including category selection URL/request/reset and direct category links. Native browser alignment checks passed at390/768/1280/1920 with no horizontal overflow; mobile and desktop screenshots reviewed. Connected marketplace native journey outcome recorded after completion. No prices, payment gates or provider/IDrive configuration changed. User's existing live-release authorization applies to this requested refinement.

## Verified live release

PR #169 head f629212892c0ecfd5c879797c3e1e82488acc65c passed all four applicable workflows: Shop40676552482/job122776333234 (685 tests, zero failures plus actual-entrypoint PostgreSQL/native browser), isolated-stack40676552352, Bringness checks40676552401 and POS release40676552318. Local connected native journey also passed at390/768/1280.

Merged as5ba41c0e6aacba525a30ea7e9463411ae87afb36. Netcup40677108063/job122778219737 completed successfully; logs confirm this exact revision deployed with prior container/database backup retained. Live HTML, CSS and marketplace-ui.js returned200 and matched reviewed source byte for byte. No production account/order fixture or payment/provider configuration change.

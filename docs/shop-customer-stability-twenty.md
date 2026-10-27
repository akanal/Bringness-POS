# Customer marketplace stability — 2026-10-27

The owner approved the twenty customer-side areas described below. Work starts from main 54b33f9bbca8dec384bda1d1715fe910c801e6cd. Existing features are retained, not presented as twenty new systems. SSH/IDrive and AI credentials remain postponed. Third-party seller publication, real inventory/shipping, messaging and image assignment remain deferred.

| # | Approved area | Result / boundary |
| --- | --- | --- |
| 1 | Search precision | Fixed truncation of catalog search text at 150 characters: category and declared feature text now remain searchable within a 4096-character catalog bound; user queries stay bounded at 150. Exact listing numbers remain exact. |
| 2 | Categories/subcategories | Existing shared taxonomy, parent/child navigation and category filter retained; category keyword regression covers all three public products. |
| 3 | Combined filters | Existing category/period/known price/net range/city filters retained; combined category-keyword/period/exact-price regression added. |
| 4 | Remove one filter | Existing chips retained; chip removal resets result pagination without removing other constraints. |
| 5 | Sorting | Existing name and period-separated price sorting retained. Unknown prices are not zero-priced products. |
| 6 | Price/currency display | Existing cent-based EUR net/gross/VAT and separate monthly/once totals retained. No currency conversion or new prices introduced. |
| 7 | Back/navigation | Existing URL/history/scroll retained; next/previous product now follows personally visible results instead of reopening hidden products. Exact listing lookup still bypasses hiding. |
| 8 | Empty results | Existing empty-category/query states and reset/suggestions retained. No fictitious offers. |
| 9 | Product cards | Approved green cards and side cart retained. |
| 10 | Image fallback | Gallery now reports a failed image, disables zoom until loaded, resets zoom on image selection and ignores stale image events. Current products have no assigned actual product photos; tests use synthetic paths only. |
| 11 | Product details | Existing public descriptions/features/facts/FAQ retained and exercised. |
| 12 | Seller identity | Existing explicit first-party Bringness profile/imprint retained. No verified external merchant profile claimed. |
| 13 | Availability | Existing preview/unpriced/unavailable labels retained. Public third-party stock is not implemented or invented. |
| 14 | Delivery/pickup | Existing first-party digital delivery explanations retained. Real seller shipping/pickup metadata remains deferred. |
| 15 | Price/additional cost clarity | Existing tax, billing-period and optional-module/hardware notices retained. No invented shipping costs or product-specific tax handling. |
| 16 | Selection/variants | Existing two priced basis products, quantity limits and alternative-base warnings retained. No public variant inventory exists; no fabricated choices added. |
| 17 | Quantity editing | Invalid/unconfirmed input survives background additions, cart close/reopen, product detail and other-row changes. Validation runs on input; Enter commits. Review guards invalid edits and commits valid pending quantities before calculating its totals. Explicit steppers clear only their own edit. |
| 18 | Removal/undo | Existing removal, save-for-later and quantity-preserving undo retained. Removing a row clears only that row's pending input. |
| 19 | Reload/storage | Confirmed quantities persist in existing session storage. Initial page load no longer rewrites stored data; damaged/unreadable carts are reported distinctly. Corrupt raw state stays untouched until an explicit cart edit. Uncommitted input is memory-only. |
| 20 | Responsive journey | Existing Shop suite plus new regression checks; native acceptance module added for 1280/768/390 widths, damaged storage, search, background add with invalid quantity, reopen, Enter, reload, review totals and removal/undo. Actual checkout remains the existing preparation flow, not payment/fulfilment activation. Physical Android/iPad testing remains separate. |

## Verification record

Local focused cart/browse checks passed (22 tests before final image regressions). Full isolated suite and the GitHub native-entrypoint/PostgreSQL/Chrome validation must be recorded from their actual final results. Local Chrome download returned invalid archives, so no local native-browser pass is claimed. No deployment or production data write has been performed in this package.

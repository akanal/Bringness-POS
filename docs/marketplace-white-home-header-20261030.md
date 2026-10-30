# White marketplace home header trial

Owner requested an independent white Bringness header using a supplied Amazon header only as functional inspiration. Apply first to /shop/; rollout to other marketplace pages requires explicit owner approval.

- White header with original green Bringness wordmark, prominent category/query search, camera/code search, account, existing order history and cart. Existing navigation/actions and prices are preserved.
- Location button opens/focuses the existing location filter; the label mirrors the explicit city field, reset and history changes. No geolocation prompt, coordinate persistence or invented delivery address.
- New CSS and JS are loaded only by the marketplace home page. No shared header, POS, waiter, checkout/provider or other marketplace page is changed.
- Responsive layout uses a single main row on wide screens, separate search row on tablets and stacked controls on phones; navigation scrolls within its own row.
- Browser QA on the local preview confirmed city focus/label/reset, search for Windows yielding one offer and cart opening without payment. Syntax/diff checks passed. Applicable CI and live verification are recorded in PR/handoff separately.
- Payment work remains isolated in PR188; none of that branch is bundled into this header trial.

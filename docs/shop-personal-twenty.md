# Shop: personal browsing and seller tools — 2026-10-26

Owner approved the next proposed twenty points and explicitly deferred the unfinished public-seller/gallery/message work from the preceding package. This package does not reactivate those tasks or AI. Continue from main, not from the Library reconstruction.

| # | Approved item | Result |
|---|---|---|
| 1 | Saved searches | Named searches, open again and delete, bounded to 20, session-only. No background alert service. |
| 2 | Clearable search history | Explicit submitted searches, maximum 20, clear without affecting viewed-item history. |
| 3 | Named favorite lists | Up to 20 session lists, add current favorites and remove entries. |
| 4 | Favorite notes | Private per-product notes, up to 1000 characters, session-only. |
| 5 | Share lists | Clean public number-only link; names and notes excluded. Recipient views selection without changing own favorites/cart. |
| 6 | Share comparisons | Up to three public products, independent comparison view, distinct billing periods. |
| 7 | Unavailable favorites | Named lists retain missing IDs and label unavailable items; unpriced current products marked not orderable. |
| 8 | Hide results | Session-local hide with restore-all; catalogue remains unchanged. |
| 9 | Grid/list view | Existing feature retained and checked; not counted as new implementation. |
| 10 | Remember filters/view | Sanitized public browse state in browser localStorage; explicit incoming links take priority. No coordinates or tokens. |
| 11 | Back scroll | Store scroll position in history entries before navigation and restore on popstate. |
| 12 | Load more | Twelve visible products at a time, explicit increments of twelve. Current catalogue has only three. |
| 13 | Print product | Scoped detail print, with print cleanup; existing comparison print preserved. |
| 14 | Offer QR | Bundled local qrcode 1.5.4 core renders SVG with quiet zone for clean immutable public ad URL. No CDN/API. |
| 15 | Own title/number search | Already provided by company-scoped server query; clarified field hint. |
| 16 | Own status filter | Existing active/archive server filter plus private preparation status among loaded rows. No public deactivation implied. |
| 17 | Batch archive | Explicit selection of loaded own active drafts, user confirmation, sequential existing revision/idempotency API. Stop at first ambiguous response; retain pending identity. Never claim an atomic batch. |
| 18 | Restore archive | Existing single-draft company-scoped restore retained. |
| 19 | Unsaved change warning | Existing editor leave/beforeunload guard retained; browser may control whether unload dialogs appear. |
| 20 | CSV export | Saved local drafts and explicitly loaded own company rows. UTF-8 BOM, quoted multiline semicolon fields, spreadsheet formula protection. No auto-fetch of other pages, credentials, financial action or import-format replacement. |

Personal storage failures retain previous data and report failure; corrupt personal storage is never silently overwritten. Existing main favorites/recent/cart remain session-based. Public sharing is explicit, cancellable, with copy/manual fallback. A shared link exposes public listing identities only, but anyone receiving it can inspect that public selection.

QR vendor: qrcode 1.5.4/lib/core/qrcode.js bundled with esbuild 0.28.2, platform browser, ESM, minification; MIT qrcode and dijkstrajs license files retained. Existing application qrcode dependency is reused, no new provider or runtime dependency. Rebuild from installed lockfile version with: `esbuild node_modules/qrcode/lib/core/qrcode.js --bundle --platform=browser --format=esm --minify --outfile=apps/web/public/shop/vendor/qr-core.js`.

## Deferred work retained

The previous package's unfinished work remains as described in docs/shop-discovery-twenty.md. It is collected there for a later authorized block, not silently counted complete here.

## Verification

See the feature PR checks and final session record for exact verified revision. Focused tests exercise storage corruption/failure, private note exclusion, hostile shared hashes, unavailable references, pagination, CSV formula escaping, QR matrix parity, account changes and uncertain partial batch outcomes, plus the actual shop entry UI. Existing full Shop suite remains mandatory. Native PostgreSQL/browser acceptance must pass before any live release; no production accounts or financial fixtures are needed.

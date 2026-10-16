# POS / AI development delivery

## Offline download client

The Windows client has a separate bundled cash register available from **Kasse → Offline-Kasse / Synchronisierung**. A company owner/admin must first log in online and activate the download entitlement on that device. Server-issued catalogs include immutable prices, taxes, merchant details and the device lease expiry. The local PostgreSQL/PGlite ledger commits each cash sale before showing its receipt. Data remains in the user's application directory across restart and installer updates. Only one desktop process may open it.

Supported offline: integer item quantities, cash, receipt printing, local receipt history. Card payments, kitchen/table operations and new authentication require the online register. The catalog expires after at most 24 hours, or earlier if the existing download-license lease ends; this is not an unlimited license bypass. An expired catalog prevents new local sales but does not prevent importing valid historical sales. Offline catalogs must be refreshed online before further trading. Device/system clocks should be correct.

Every 30 seconds, and after startup, resume or focus, while an owner/admin has a valid online session, pending sales upload before the catalog refresh. Tokens are read into memory, never persisted by the native synchronizer. Stable UUIDs and canonical fingerprints make retries idempotent in both databases. Cloud import preserves original sale time and catalog amounts. Local receipts retain their OFF-prefixed number. A pending transfer is retained after any error; account changes cannot discard the previous company's pending sales. Never uninstall/delete the application data before all sales are acknowledged.

The AI worker reconciles imported stock independently. Its durable deterministic request keys recover a lost POS acknowledgement after AI already committed. A stock conflict never deletes the historical financial sale or silently permits negative inventory. **Belege → Offline-Verkäufe & Lagerabgleich** shows states and lets the owner retry after fixing stock/recipe configuration. A sales-mode connector imports delayed historical sales through the same deduplicated event ID as the regular sales worker. Without an active connector, the import is marked not linked; a later connector does not automatically backfill it.

Fiscal signing remains pending under the existing TSE launch gate. Offline sale support does not constitute a certified offline fiscalization implementation.

## Accountant access

**Belege → Steuerberater & Finanzamt – Exportzentrum** creates a read-only bearer link for one restaurant and inclusive Berlin-date range. The UI grants seven days; the API allows 1–30 days. Only hashes are stored; the secret is shown once, kept out of query strings, and removed from the accountant page's address after loading. The owner can revoke a grant. No email is sent automatically.

The accountant page exposes receipt snapshots, payment allocations, original line quantities/prices/taxes and CSV/JSON download. It offers no POS administration or mutation routes. Every page rechecks expiration/revocation. Keyset pagination and a recorded-at cutoff include more than 200 receipts and exclude receipts imported after the export started. CSV cells guard spreadsheet formula prefixes. Internal JSON and CSV are explicitly not official DSFinV-K exports.

The existing owner/platform-admin roles and administration screens remain responsible for device licenses, staff, audit, billing and platform controls. Native remote-support transport is still unconfigured; a support command is not reported completed without a transport.

## Weather / events

**Bringness AI → Planung & Termine** adds optional location-specific demand rules: warm-day threshold/effect, rainfall threshold/effect and one combined event-day effect. All effects default to zero and the feature defaults off. They are explicitly operator-defined scenarios, not learned causal weather coefficients. Complete DWD MOSMIX days are required; missing/partial weather and cancelled events have no effect. Multiple overlapping events apply the event percentage once. Combined effects are bounded to ±50% and fade as actual sales progress becomes stronger evidence. Closed days and insufficient historical sales still produce no quantity recommendations. Recipe demand and purchase-cost estimates use the adjusted pace. The next six days have independent historical-weekday forecasts that exclude today’s incomplete sales. Immutable forecast snapshots retain the applied factors and event versions for later comparison.

## Automatic procurement

**Bringness AI → Planung → Automatische Beschaffung** defaults off. The owner must expressly approve selected suppliers, their displayed delivery conditions, planning horizon, lead time and a daily net merchandise value ceiling. The ceiling excludes VAT/delivery charges: this distinction is shown before permission is saved. Changed delivery area/terms/minimum value block the automatic run until permissions are renewed. No supplier/budget is enabled for an existing account by migration.

The hourly worker sends at most one successful automatic checkout per restaurant account per Berlin calendar day, across its locations. Manual Run uses the same permission. It uses current target/free stock, 28-day recipe consumption, confirmed on-time inbound stock and matching available catalog offers. Activated location-specific weather/event scenarios weight planned daily consumption across the procurement horizon; known closed days add no planned consumption. Missing future weather stays neutral, while configured minimum/target stocks remain the floor. Unconfirmed orders remain visible as unsafe inbound quantities and block another draft for those ingredients. Units, exact ingredient names, pack/minimum quantities, explicit delivery area and supplier trade approval are checked. Incomplete plans block all automatic ordering. Supplier combinations are bounded to 256; no unnecessary stock is added just to meet a supplier minimum.

Automatic orders use the same transactional cart checkout as manual orders. Buyer lock, live quote/launch-gate validation, policy-version lock, fresh need calculation and deterministic daily request key prevent stale or duplicate checkout. Orders and the completed run commit together. Blocked runs show their reason and can be retried after correction. Revoking permission prevents subsequent runs; it does not cancel an already committed supplier order. Suppliers still confirm dates; no payment debit is introduced by this feature.

## App build / external release prerequisites

- Windows CI builds the client and checks Authenticode. A configured certificate that fails validation fails the build. Unsigned CI artifacts are explicitly test builds and never replace the public installer release. Required secrets: `WINDOWS_CSC_LINK` (PFX/base64 or certificate location) and `WINDOWS_CSC_KEY_PASSWORD`. Signing identity must match the win.signtoolOptions.publisherName configured in the desktop package. A real organization certificate/private key must be supplied through GitHub secrets, not committed to the repository. A signature does not promise immediate SmartScreen reputation.
- Product decision 2026-10-07: no native iOS download is offered. iPhone/iPad customers use the online browser register. Native iOS distribution and Apple enrollment are deferred until demand; only manual simulator builds remain. The retained iOS/iPadOS prototype includes a SwiftUI/WKWebView client for iOS 16+, persistent login, constrained HTTPS navigation, native alerts, camera permission prompts, download sharing and retry/reload UI. XcodeGen generates the project; A manually requested CI run can build the unsigned simulator app. This artifact cannot be installed on an iPhone. Apple Developer membership, registered bundle ID `de.bringness.pos`, signing team/profiles, App Store metadata and App Store Connect access are still required for a signed device build/TestFlight submission. The code-defined POS app icon is generated during the macOS build. Simulator compilation is not real-device acceptance or Apple approval.
- Existing Mollie/TSE external activation remains deferred. No provider credentials, certificates or account/budget permissions are fabricated.

## Verification

`node --test server/ai-demand-core.test.js` validates neutral rules, missing/partial weather, cancellations, overlapping events, bounds, sales precedence and typed input validation.

`node server/ai-tests/offline-accountant.mjs` uses real filesystem-backed PostgreSQL persistence and a separate cloud PostgreSQL engine for restart, lost acknowledgements, immutable price import, tenant isolation, stock guard and a frozen 251-receipt export with revocation.

`node server/ai-tests/pos-stock-bridge.mjs` includes imported-sale stock replay after a failed acknowledgement and insufficient-stock conflicts. `node server/ai-tests/integration.mjs` exercises real PostgreSQL-backed AI HTTP/DOM flows plus automatic checkout permission, budget, changed-need rejection, duplicate suppression and disablement. Windows packaging runs on its CI host. Apple SDK compilation is retained as a manual, deferred workflow.


## Verified development checkpoint — 2026-10-16

Branch: `finish/pos-release-audit-20261016`. These changes are committed development work; production was not deployed.

- `cff70d9`: local cloud-receipt identities are checked transactionally against historical acknowledgements, including after restart. A cloud receipt cannot acknowledge two local sales within one company; receipt numbers are scoped to the restaurant. Matching replays preserve the original acknowledgement, conflicting replays fail, and concurrent acknowledgements are serialized by PGlite. The new filesystem-backed test reopens the database and checks concurrent conflicts.
- `3b37000`: DWD completeness requires distinct hourly points and every temperature/rain measurement for the entire Berlin day. Normal, spring and autumn days require 24, 23 and 25 hours respectively. Missing/duplicate hours cannot activate weather demand adjustments.
- `b167f42`: automatic purchasing isolates account failures, reuses the supplied database for initial and final need checks, and verifies the current Berlin date before checkout. The cart rechecks the locked buyer's active restaurant permission before replaying or creating an order. A suspended or changed-role buyer is rejected and rolled back.
- `09bbcb9`: existing Center browser/PostgreSQL and full POS/AI integration workflows now also run on `finish/**` branches. These are validation workflows only.
- `d9c25c7`: an observer failure caused by a closing desktop window cannot interrupt acknowledgement or reject the periodic recovery promise. Both initial transfer and a subsequent synchronization are covered.
- `92f6da3`: release-branch CI now runs desktop persistence/synchronization and AI weather/purchasing tests. TSE worker mocks now return the actual affected-row contract; offline amount tests distinguish position overflow from aggregate overflow. No production safety checks were weakened to make tests pass.

Verification completed on this checkpoint:

- 22 desktop tests passed, including the existing 20 synchronization cases, the new durable-ledger integration case and recovery after window closure.
- 14 weather/demand/planning tests and 3 purchasing regression tests passed.
- 42 critical POS/TSE tests passed.
- The broader Node run passed 292 tests, skipped one opt-in PDF/QR integration case and could not start 21 Center browser cases because no browser executable was installed. Downloading Chromium failed with truncated archives; these browser cases were subsequently verified on GitHub as described below.
- The opt-in real PDFKit/QR receipt integration was then run with both installed libraries: all 12 receipt tests passed, including the previously skipped case.
- `node server/ai-tests/integration.mjs` passed the complete embedded PostgreSQL and DOM integration flow, including automatic procurement, tenant isolation, invoices, inventory and POS-to-AI processing. Provider calls are simulated; this is not a live provider acceptance test.
- `node server/ai-tests/offline-accountant.mjs` passed persistence, cloud replay, tenant isolation, stock guard and 251-receipt pagination.
- `node server/ai-tests/pos-stock-bridge.mjs` passed 36 scenarios using separate PostgreSQL engines.
- GitHub [POS release validation run 38948341857](https://github.com/akanal/Bringness-POS/actions/runs/38948341857) completed successfully for `92f6da3`.

GitHub alternatives completed successfully for `09bbcb9`:

- [Center validation run 38948843313](https://github.com/akanal/Bringness-POS/actions/runs/38948843313): both Chromium and WebKit jobs passed, including authorization checks, migration/lifecycle on PostgreSQL 16 and all 21 browser scenarios in each engine. This resolves the local browser-executable limitation without claiming local browser execution.
- [Full POS/AI integration run 38948843238](https://github.com/akanal/Bringness-POS/actions/runs/38948843238): completed successfully, including mail, display, billing, remote-support, offline/accountant, POS/AI stock and full AI integration validation.

External fiscal/provider activation, Windows signing/release and real handset checks remain separate acceptance steps. No live activation, supplier order or payment was performed by this development session.

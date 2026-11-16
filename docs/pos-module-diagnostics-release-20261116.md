# Verified live: independent POS module diagnostics

PR #334, final feature head `775f7558ac60b8a91783bde01586114df817be5f`, merge `4248897d9ad0f2196ee12d1ac96bae8da871a09b`.

Netcup run `43826088783`, job `133160159078`, succeeded. Authenticated deployment logs confirm the exact revision deployed and retention of the previous container and database backup.

All six feature PR workflows succeeded: Bringness checks `43825628645`, release `43825628689`, colours/navigation `43825628659`, isolated stack `43825628786`, POS/AI integration `43825628727`, Center/native Chromium/WebKit `43825628930`. Local verification included 736 unit tests, private diagnostic regressions and existing display, personnel and accountant UI suites. Native browser coverage includes actual personnel/display errors and uncertain writes, manual copy fallback and 390/1280px layouts.

Public diagnostics.js, displays.js, personnel.js, restaurant-owner.js, tax-export.js and availability.js returned 200 and matched the reviewed source byte for byte. The public POS page references all six with diagnostics-modules-20261116. Health returned 200, status ok and database ok.

Scope and limitations: docs/pos-diagnostic-codes.md. Fixed module categories DISPLAY, PERSONNEL, CATALOG, AVAILABILITY and TAX; only code/UTC time/component version/online flag exported. No automatic retransmission or new timeout; preserved request headers and authorization. Unconfirmed display saves no longer claim the previous content was retained. Direct binary downloads and separate pages remain outside this scope. No production orders, payments or customer settings were created or modified for verification. Owner practical test remains postponed.

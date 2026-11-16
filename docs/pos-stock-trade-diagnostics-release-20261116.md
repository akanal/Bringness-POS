# Verified live: stock and trade diagnostics

PR #335: https://github.com/akanal/Bringness-POS/pull/335 . Final tested head `9a2e4b0251debc191f275ba35d5f8ed37643ba83`, application tree `6366ad8efe12c24c18d6819ab8d2c1a1178db96c`, deployed merge `c26de0983f60a8db474a8d4c74bf913047f96332`.

All seven final-head workflows passed: Bringness checks `43855230903`, release `43855230956`, colours/navigation `43855230891`, isolated real application/PostgreSQL `43855230906`, POS/AI integration `43855231024`, native Center/POS Chromium/WebKit `43855230833`, Shop integration `43855230849` (886 tests, 886 passed, no failures). Local validation also passed 736 unit tests, 20 inventory workflow cases, existing trade/auth/navigation UI checks, extended private diagnostics tests and 37 POS/AI stock bridge scenarios.

Native Chromium job `133257680436` and WebKit job `133257680946` passed the actual standalone inventory's private copy fallback and exact replay after a lost count acknowledgment. Both also passed the actual trade invoice lookup for forbidden, HTML/non-PDF and successful PDF responses without another sale. A stock polling regression confirms the original commandId/pending metadata and STOCK categorization when the originating action is an article update. Native timeout errors are classified separately from network errors.

Netcup run `43856460654`, job `133261868048`, succeeded. Authenticated logs confirm `pos deployed: c26de0983f60a8db474a8d4c74bf913047f96332` at 11:20:33 UTC on 16 November 2026 and retention of the previous container and database backup.

Live verification after deployment:

| Asset | SHA256, byte-equal to reviewed source |
| --- | --- |
| pos/app.js | 7a9d5fa7c315d7c1654c7b8689cf4fafa01380bc46152287d1ad517bd9f8b759 |
| pos/diagnostics.js | f58d5641926232647e482d4367ea0a7d2ec0209cfab18ab3a7e13216d57e18c7 |
| pos/operations.js | 52700dd8acb75ac7f6561ebf6f29c93b8462bf18978d5ed1045af3af090c7875 |
| pos/trade.js | 3613a9cddecaafddf5b145a2f031748e0a67778821b7ef884bb433118e0cc62f |
| pos/diagnostics.css | 622d42ff22cc0484419f738ae1435e2f2d61c848f5b90e3420e3da2d37467484 |

The public POS entrypoint references match source. The actual referenced app.js URL retains `v=diagnostics-20261115`; its content was independently fetched, matched the new reviewed source and returned `cache-control: no-store, max-age=0`. Diagnostic/trade references use `stock-trade-20261116`. The separate operations entrypoint references its own diagnostic script/styles and updated operations script. Public health reports application and database ok.

Scope/limitations: docs/pos-diagnostic-codes.md. No additional automatic retries, write identifiers, deadlines or permissions. The diagnosis export remains code/UTC time/fixed component version/online flag only. Definite count rejection and uncertain-write replay stay distinct. This verification created no production counts, orders, payments or customer settings. The owner's practical test remains postponed.

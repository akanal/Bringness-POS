# Shop live integration, 2026-10-25

Owner explicitly requested current-source integration, end-to-end validation and
publication. This supersedes the earlier local-only/no-push restriction for the
reviewed shop release. The established Netcup automation remains the deployment
mechanism. Current status operation succeeded via authenticated SSH: POS, AI,
database and translator running, Caddy active (run 40243739929).

The release is built on current main 4b754c3d101ac3f2f60376f3fde1b2676817ebf8,
a status-only child of the verified application base 1da9637. Existing application
files are preserved by a base-tree Git operation. Only current server/start.js
and server/index.js receive reviewed additive shop changes; shared price/password
helpers, POS/waiter/AI files, dependencies and deployment infrastructure stay intact.

The explicit release transform enables account-scoped shop preparation and separate
registration on the POS runtime unless their existing flags are explicitly false.
Registration accepts only the canonical https://bringness-pos.de origin. AI mode
remains excluded. Migrations retain closed-until-ready behaviour and prerequisite
schema inspection. The index adds only /shop and /shop/ directory routing, and the
existing generic logo injection excludes the shop directory.

The added CI workflow runs the complete isolated suite, then the actual current
server/start.js with PostgreSQL 16 and Chromium in a disposable database. No real
provider credentials, emails or production account writes are used by those tests.
The smoke checks actual registration/replay, the original login route, quotes,
draft/replay, checkout preparation, company isolation, history and no financial or
licence grants; Chromium checks wordmark/overflow at four widths and real login.

Publication does not enable payment dispatch, a public callback, real invoice
issuance or installer delivery. Existing UI says payment/licence activation is
blocked. These are functional sales limitations, not a claim of a sales-ready shop.
The internal TEST adapter and invoice-preview code remain unmounted. No fake paid
status or licence grant is introduced to make the page appear complete.

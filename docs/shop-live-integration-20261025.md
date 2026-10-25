# Shop live integration, 2026-10-25

Owner explicitly requested current-source integration, end-to-end validation and
publication. This supersedes the earlier local-only/no-push restriction for the
reviewed shop release. The established Netcup automation remains the deployment
mechanism. Current status operation succeeded via authenticated SSH: POS, AI,
database and translator running, Caddy active (run 40243739929).

The release is built on current main 4b754c3d101ac3f2f60376f3fde1b2676817ebf8,
a status-only child of the verified application base 1da9637. Existing application
files are preserved by a base-tree Git operation. Current server/start.js
and server/index.js receive reviewed additive shop changes; legacy billing reservation
also excludes open shop drafts, and Windows access uses the shared entitlement guard.
Shared price/password
helpers, POS/waiter/AI files, dependencies and deployment infrastructure stay intact.

The explicit release transform enables account-scoped shop preparation and separate
registration on the POS runtime unless their existing flags are explicitly false.
Registration accepts only the canonical https://bringness.de origin. AI mode
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

Release review: https://github.com/akanal/Bringness-POS/pull/137
Integrated current-source isolated suite: 508 passed. Final-head entrypoint and
all five additional regression workflows passed before merging. Actual PostgreSQL
concurrent draft/replay and legacy-path exclusion passed; Chromium passed four
viewport widths and real login. PR 137 merged as
7f1771d0afbcf0a7ae57dd057614eff75cd76060. The initial Netcup publication succeeded in run 40245574911.
Live browser verification identified the redirect from bringness-pos.de to
bringness.de. Canonical-origin correction 262d2309956252580cdc4e535a3dc572eb2324c1
passed 18 targeted checks and Netcup deployment run 40245934682. The current
deployed revision is that correction; both operations retained the previous
container and a database backup.


## Final live verification

Canonical public URL: https://bringness.de/shop/

Twelve public/readiness checks passed after the final deployment: shop, login,
registration, shop JavaScript, health, POS and waiter pages return HTTP 200;
draft/history/licence APIs reject unauthenticated reads with 401; an intentionally
invalid same-origin registration is validated with 400 while an untrusted origin
is rejected with 403. No production account, order, payment or licence was created
by these probes. Actual account creation/login and prepared-order writes were
verified in disposable PostgreSQL through the real current entrypoint instead.

The live browser shows the approved text wordmark and functional Windows search
(one result), then reset returns all three products. Generic brand-logo.js is not
injected into shop pages. The live interface explicitly retains its preview/payment
block notice: actual payment, final invoice issuance and Windows delivery are not
completed or publicly enabled by this release.

Source of truth is now repository main, including PR 137 and the canonical-origin
correction. The earlier Library reconstruction is a historical checkpoint; do not
replace the current deployed application with that old source tree.

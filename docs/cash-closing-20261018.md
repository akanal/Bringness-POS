# Cash sessions — 2026-10-18

Unpublished feature branch based on customer/delivery commit 3a80361 (PR #90). No merge or deployment requested.

Implemented: one open session per restaurant; starting float; reasoned deposits/withdrawals; counted cash and required explanation of differences; persisted closing report and browser print. Retail/trade and payment methods are reported separately; both share the physical cash balance. Owner/admin/manager access and company isolation are enforced server-side. UUID request identities survive uncertain responses and reloads; modified replays are rejected.

A payment INSERT trigger takes the same restaurant advisory transaction lock as opening/closing and assigns each newly inserted payment to the currently open session. This covers ordinary, wholesale, table and offline-import payment writers without replacing checkout. Closing reports retain totals and movement snapshots. Closing does not create payments, receipts or fiscal signatures.

Scope limits: a server-arrival cash session report, not a complete statutory fiscal daily/Z report. Payments before opening or with no open session are not included. Historical sales are not backfilled. Offline sales arriving late belong to the session open at server receipt; closed reports are not rewritten. Cash sessions are server-only, with no offline opening/closing. Exports, tax breakdown, fiscal daily close and a separate unassigned-payment reconciliation workflow remain follow-up work. Existing ordinary bon/trade A4 invoice behavior is preserved.

Local verification: 514 unit tests; embedded PostgreSQL integration (permissions, isolation, replay/conflict, payment capture, insufficient cash, difference reasons, closed-session write rejection and report preservation); DOM UI check for euro cents and persistent lost-response recovery; existing customer/delivery database and UI checks. Real PostgreSQL simultaneous-open test added to CI but not run locally. No live verification or remote CI success claimed.

Remote branch push was rejected by automatic approval review; no alternate upload attempted. Commit remains local pending explicit authorization for the GitHub save. Live publication remains deferred independently.

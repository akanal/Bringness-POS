# Ten connected seller persistence blocks — 2026-10-26

1. Additive PostgreSQL tables for company-scoped offer drafts, replay receipts and version history; no alteration of shared companies/users or financial tables.
2. Shared canonical offer validator for editor, local drafts and server, retaining the 82-category taxonomy and existing field/GTIN/price checks.
3. Existing active owner/admin session authorization reused, with fresh session/user locks and company scope on every read/write. Foreign records are not exposed.
4. Explicit create/update with expected revision; company locking serializes writes and prevents silent overwrite.
5. Durable request UUID/digest receipts make identical retries return the original acknowledgement. Changed-body reuse fails. Browser references are bound to a session fingerprint, without persisting credentials, and cannot be sent under a changed token.
6. Reversible archive and explicit restoration, each producing a new version; no permanent delete or publication endpoint.
7. Server search and keyset pagination (25 at a time), explicit archive list and latest 20 version references. Historical content opens for review; saving it explicitly creates a new version against the current revision.
8. Separate authenticated seller-cloud.html overview with explicit load, search, pagination, archive/restore, history and uncertain-request recovery. Never auto-retry or infer success.
9. Existing editor gains explicit account load/save alongside local tab storage. Old local drafts are retained; no bulk upload. Cloud edits are held in memory and hidden while paused, then require a fresh access check. Account changes clear cloud fields/preview; late replies are suppressed.
10. Current-main startup integration, isolated schema/service/HTTP/client safety checks and actual PostgreSQL concurrency/native-browser acceptance added to the existing release workflow path.

## Boundaries and limits

No vendor verification, public product publication, fulfilment, settlement or payment activation. Saving is available only to the current company's owner/admin. Current technical caps: 200 draft records including archive and 10,000 acknowledged changes per company; 16 KiB request bodies, 15-second total body deadline and four admitted operations per process. Financial records are untouched. Archive/history are offer-draft history, not tax invoice cancellation.

Unknown replies retain an identical explicit retry reference. Confirmed no-write validation/version errors allow a new corrected command. Old replay acknowledgements are historical acknowledgements, not claims that no newer version exists. Browser-local data is not silently associated with another company.

The actual release start.js was fetched from GitHub main. Only additive seller-runtime import/construction/handling/migration hooks are applied to that source. The unrelated unpublished reconstructed startup remains separate and is not deployed. Existing source preparation pins are historical and unchanged.

Local focused checks passed: schema re-entry, canonical validation, owner/role/session/tenant isolation, revision conflicts, identical/changed replay, archive/restore, historical reads, bounded pagination, literal search, unchanged financial tables, HTTP origin/body/method gates, lost replies/account-specific recovery and token-switch transport refusal. Real PostgreSQL parallel sessions and native browser reads are exercised by the updated production-entrypoint smoke in CI, not claimed from PGlite.

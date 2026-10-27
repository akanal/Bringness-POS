# Seller draft recovery — 2026-10-27

The owner requested autonomous continuation in twenty-point blocks. This package follows the customer stability branch, without redoing its completed work. The twenty checkpoints below distinguish fixes from retained safeguards. It does not activate public merchant publication, inventory, variants, shipping, payments, AI configuration or IDrive.

| # | Checkpoint | Result |
|---|---|---|
| 1 | Duplicate saved identities | Loading rejects repeated IDs instead of exposing multiple rows to a single edit/delete action. |
| 2 | Case-only duplicates | Loading and saving compare IDs without case differences. |
| 3 | UUID structure | Local persistence uses the shared UUID validator, including version and variant. |
| 4 | Damaged JSON | Existing rejection retained; original storage is not overwritten. |
| 5 | Wrong storage shape | Reads reject nonarrays; writes now explicitly reject them before mutation. |
| 6 | Invalid offer payload | Existing shared offer validation retained on both reads and writes. |
| 7 | Valid roundtrip | Distinct valid IDs, canonical prices and offer fields survive save/reload. |
| 8 | Capacity and serialized size | Existing 50-row/600000-character bounds and no-write-on-validation-failure retained. |
| 9 | Imported identity | Existing explicit imports generate fresh IDs; no automatic account writes. |
| 10 | Requested account identity | A read response must now name the exact requested offer. |
| 11 | Current versus historical | Current reads reject historical response markers. |
| 12 | Requested historical version | Historical reads require exactly the requested source revision. |
| 13 | Historical revision bounds | Source revision must be a positive safe integer no newer than current revision. |
| 14 | Invalid response payload | Invalid offer content now reports the consistent INVALID_RESPONSE code. |
| 15 | Version ordering | History rejects duplicate or ascending revisions. |
| 16 | History action/state | Archive must be archived; save/restore must be draft. Null/malformed rows are rejected. |
| 17 | Lost first-save reply | Identical retry retains its original ID/request; successful recovery fills the confirmed ID. |
| 18 | Edits after a lost reply | Newer form edits remain intact. Further account saves are blocked until explicit reload; export remains available. Cancelling reload preserves the edits and gate. |
| 19 | Account/visibility transitions | Existing privacy clearing and account binding retained; pending-request UI now ignores stale asynchronous results. Recovery gates reset on account change, not on an unrelated local save. |
| 20 | Browser acceptance | Native regression added for real lost-response recovery, cancelled/accepted reload and overflow at 390/768/1280, using disposable accounts and PostgreSQL only. Record actual CI outcome below. |

## Validation

The first targeted run passed 18 tests with no failures/skips. Full isolated suite and native acceptance results are pending. No deployment is claimed. Preserve the green design, existing prices, private draft boundaries and financial gates. Public merchant systems remain separately unfinished.

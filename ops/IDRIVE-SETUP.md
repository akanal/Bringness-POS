# IDrive documents connection bootstrap

Prepared for the existing Frankfurt-2 account and `bringness-documents`. This is a connection bootstrap, not an activated application document backend. No invoice or receipt migration, public access, retention change, deletion, service restart or application deployment is performed.

## Observed access boundary

The owner-connected IDrive browser successfully signed in and shows an existing `bringness-netcup-documents` read/write key limited to selected buckets. Its secret was not read or copied. Bucket encryption and versioning were previously confirmed in the UI. Global bucket privacy and each permission still require actual API/UI acceptance.

The existing GitHub Actions SSH key is forced through `ops/netcup-command.sh`, which allows only status, backup, restart and deploy. It cannot execute this bootstrap or edit secret configuration. Do not bypass that restriction by adding secret-handling code to application startup, printing existing keys or weakening SSH. One interactive administrator console on the actual Netcup host is required for the initial setup. Existing automation is preserved.

## Execution on the actual POS host

Obtain this reviewed source revision on the server, then use a dedicated Python virtual environment. Inspect source before executing it as root. Do not run any command containing a secret or paste credentials into chat.

```sh
python3 -m venv /opt/bringness-pos/idrive-tools
/opt/bringness-pos/idrive-tools/bin/pip install -r ops/idrive-setup-requirements.txt
/opt/bringness-pos/idrive-tools/bin/python ops/configure-idrive-documents.test.py
/opt/bringness-pos/idrive-tools/bin/python ops/configure-idrive-documents.py setup
```

The administrator enters the already-created access ID and secret at invisible terminal prompts. The target configuration directory must already exist, belong to root, have no writable group/other permissions, and have no symlink components. Credentials persist only after all connection checks succeed, exclusively in `/opt/bringness-pos/config/idrive-documents.json`, mode 600. An existing destination is never overwritten. No values are printed in failures. Preserve this protected file in the server's restricted secret backup process; never commit or upload it to ordinary artifact storage.

The script uploads one tiny synthetic text object under `_bringness-connection-checks/<random>.txt`, with explicit private ACL, AES256 and a no-overwrite condition. It reads the exact bytes back and requires a specific anonymous AccessDenied/403. Timeout, 404, foreign-key error or 5xx is inconclusive and fails. Unsupported private ACL or conditional upload fails with no weakened fallback. The tiny test object remains because the application key deliberately has no delete permission. A failed probe may also leave this synthetic object. This proves the tested object's behavior only, not a whole-bucket policy audit, retention compliance or recovery of real business documents.

An explicit later check can use the saved credentials, creating a new synthetic object:

```sh
/opt/bringness-pos/idrive-tools/bin/python ops/configure-idrive-documents.py check
```

No automatic retries or provider calls occur merely by importing the module or running its tests. No new administrator key is created. Read/write credentials can still upload new versions, so versioning is not a substitute for retention or a separate backup.

## Validation and remaining work

13 isolated tests passed locally with synthetic credentials and mocked S3, including non-overwrite/symlink/file-mode checks, fixed endpoint, no retries, encrypted byte-for-byte readback, public access rejection and nonconclusive provider results. No real Netcup-to-IDrive request has yet been run. SDK is pinned in the adjacent requirements file. Official API references: https://www.idrive.com/s3-storage-e2/guides/operations and https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/put_object.html.

After actual server acceptance, implement a separate reviewed application adapter with tenant authorization, immutable object references/digests, bounded timeouts and controlled original-file retrieval. Do not claim application integration or full-bucket privacy from this bootstrap. Public media, external backups and final invoice retention/delivery are separate tasks. Account still displays a seven-day trial; no paid upgrade has been made.

## One-run administrator console setup — 2026-10-28

`ops/idrive-connect.sh` automates source download, SHA256 validation, a separate Python environment, pinned requirements, all 13 synthetic checks, protected directory validation and the existing interactive setup/check. Run the reviewed script as root from a real terminal using a downloaded local file (not a pipe, so hidden prompts retain terminal input). Existing configuration is never replaced; if present, it runs check instead of setup. No SSH access restrictions are changed. A tiny synthetic private encrypted connection-check object remains. This does not activate document storage or scheduled backups.

The runner downloads the three reviewed source files from commit7902cf49ff13a87c4d4378d67b034c1fa907044c and verifies their embedded SHA256 digests before any Python execution. It uses a fresh root-private temporary working directory, so earlier truncated console filenames cannot affect execution. It does not upgrade or restart the production application. Requires curl, Python3 with venv, sha256sum and an interactive root console.

Validation: bash syntax passed, 13 original synthetic tests passed with pinned dependencies, and five orchestration tests passed (correct ordering, damaged/failed download rejection, dependency failure and failed checks stop before setup). The orchestration tests stub privileged filesystem work and all provider calls. Real server/IDrive acceptance remains pending owner console execution and hidden credential input.

## Console acceptance and unsigned check — 2026-10-28

Owner console screenshots confirm installation and synthetic tests pass. Diagnostic run reached anonymous-access verification after signed upload, exact encrypted readback, then failed with an unclassified exception. Credentials are not persisted on an inconclusive probe; full acceptance remains outstanding. Never describe this as a working backup.

The anonymous GET now uses an independent standard-library HTTPS client rather than the S3 SDK. It sends no Authorization or Cookie headers, disables ambient proxies and redirects, fixes endpoint/bucket/exact random probe key, sets a15-second timeout and bounds error-body reads to8193 bytes. Only HTTP403 with an explicit S3 Error/AccessDenied, Forbidden or403 code counts as denial. Redirects, public200,404,5xx, malformed/oversized responses, network failures or other error codes fail closed. This neither drops private ACL/AES256/conditional upload nor changes existing objects or bucket access policy. Signed SDK remains unchanged. Safe stage diagnostics interpolate no provider error text or keys.

26 synthetic source tests and five runner tests pass; bash syntax checked. Runner now pins sourcec3244923f0f16c1f01dcf9d0fc19a6fc3d927589 with SHA256 checks. Requires new owner console run; production-to-IDrive success and durable config are not claimed.

## Revised acceptance after observed IDrive behavior — 2026-10-28

This section supersedes the earlier403-only anonymous criterion. Console and independent unauthenticated HTTPS checks return302 to exactly https://www.idrivee2.com without serving the synthetic object. Do not accept arbitrary redirects or this redirect alone. Signed API inspection confirms object Owner.ID is omitted, one canonical FULL_CONTROL grant exists, bucket owner is present, bucket grants include owner FULL_CONTROL plus LogDelivery WRITE/READ_ACP, and GetBucketPolicy reports NoSuchBucketPolicy. The object canonical principal still must be compared with the independently returned bucket owner during the new setup run; the screenshot alone cannot establish that equality. PolicyStatus read is denied and is not treated as a successful privacy check.

The updated probe requires signed byte-exact AES256 readback, bucket ACL with exactly one canonical owner FULL_CONTROL and at most distinct LogDelivery WRITE/READ_ACP grants, a single object canonical FULL_CONTROL grant matching that verified owner, and a confirmed NoSuchBucketPolicy response. Missing object Owner.ID is supported only through this independent equality check; a conflicting owner, public/global groups, unknown grantees/permissions, duplicate grants, unavailable/denied policy, or any existing policy fails closed. Only after these checks can an unsigned explicit403 denial or302 to the exact HTTPS IDrive homepage count as no anonymous object delivery. Redirects are never followed; external/http/query redirects and public200 fail. This verifies the tested object and current ACL/policy state, not global privacy or future policy changes.

Validation:37 source tests plus six runner tests pass. No source test calls real providers; orchestration stubs privileged work. Console acceptance and root-only credential persistence still require the next explicit setup run. No application document backend, scheduled backup, restore acceptance or production policy change has been implemented. A previously visible console input was not copied into code or documentation; owner was advised to rotate it if it was a secret rather than an access ID.

## Authenticated uploader identity binding — 2026-10-28

Subsequent console run reached ACL verification but the object's canonical FULL_CONTROL principal did not equal bucket Owner.ID. Do not assume this means public access, and do not accept an arbitrary canonical principal. Updated verification permits only the independently read bucket owner OR the exact Access Key ID used to construct the authenticated S3 client that successfully uploaded/read this very object. This is an explicit equality check, not an inference that every IDrive principal equals a key. Missing object Owner.ID is supported; a conflicting explicit owner still fails. Foreign/malformed/multiple/public grants, non-FULL_CONTROL permissions, existing or unreadable bucket policy still fail. No user secrets or canonical IDs are printed.

40 source tests plus six runner tests pass, including exact-key match, mismatching key, foreign/public grants and conflicting explicit owner. Actual IDrive principal-to-key equality remains unconfirmed until next owner console execution; no configuration persistence or successful connection is claimed from this source change.

## Remaining real-provider blocker — 2026-10-28, screenshot353

Owner ran runner23356b78d5b69adcf2355e2b58d298ce4629b5c6 with source40 tests passing on the real server. Signed upload and exact encrypted readback still succeed; privacy verification rejects the object grantee because it equals neither independently read bucket Owner.ID nor the authenticated Access Key ID. This disproves both proposed identity mappings for this account. Stop repeating setup or broadening the accepted principal set. No durable credential configuration was written by these failed setup attempts.

Provider clarification is required: GetObjectAcl omits Owner.ID and returns one canonical FULL_CONTROL grantee; GetBucketAcl reports a different owner and LogDelivery WRITE/READ_ACP; GetBucketPolicy reports NoSuchBucketPolicy; GetBucketPolicyStatus is AccessDenied; unsigned requests to the account-advertised eu-central-1 endpoint (path style and direct virtual-hosted synthetic object URL) redirect302 to https://www.idrivee2.com. Ask IDrive how to verify that canonical object grantee belongs to the account and what exact unsigned object endpoint/denial behavior should be used. No key/secret values or raw signed requests should accompany diagnostics. Current evidence proves authentication/upload/readback only, not completed protected bootstrap, scheduled backup or restore acceptance. Do not bypass principal verification or change production ACL/policy without a reviewed resolution.

## Provider-confirmed resolution — 2026-10-28

IDrive support ticket ID908391503 (reply2026-10-28 10:39UTC) confirms Bucket/Object ACL responses are compatibility stubs, not ownership/access evidence; keys/bucket policies control access. Public FAQ https://www.idrive.com/s3-storage-e2/faq#s3-api independently lists ACL APIs as unsupported. This supersedes the previous ACL principal comparisons; no additional principal guessing is performed.

Setup no longer sends an ACL header or requests ACL/PolicyStatus. It still requires a signed synthetic no-overwrite AES256 upload and byte-exact readback, then a signed GetBucketPolicy yielding exactly NoSuchBucketPolicy. Any existing or unreadable policy fails for separate review; no policy is written or removed. Both exact path-style and virtual-hosted synthetic object URLs must independently deny anonymous delivery: explicit403 AccessDenied or302 to the exact HTTPS IDrive homepage only. Redirects/proxies are disabled; public200, unknown redirects,404,5xx, malformed errors and network failures remain inconclusive and block credential persistence. This follows the provider's default-private explanation and verifies the tested object paths/current policy, not full-bucket or future privacy, retention, production recovery or backup automation.

37 synthetic source tests passed, including provider-stub independence, existing/unreadable policy rejection, both unsigned object paths, no authorization/cookies, public access rejection, safe errors and exclusive mode600 configuration. No real-provider setup has succeeded yet. Owner must run the updated pinned runner once and enter the existing Access Key ID first, Secret Access Key second at hidden prompts. Secrets are never requested in chat. Existing restricted SSH automation is unchanged.

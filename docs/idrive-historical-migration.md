# Historical IDrive migration — operator preparation, not deployed

Owner requests moving existing files off Netcup to reduce storage load. Preserve the database/application on Netcup. This preparation does not establish that any production file was transferred.

## Verified implemented slice

`ops/migrate-idrive-media.mjs` defaults to read-only aggregate inventory. `--apply --readers-deployed` explicitly requires the compatible PR172 readers to have been deployed and verified. Run only inside an already authorized operator environment with the existing application DATABASE_URL and IDrive variables; never print or copy their values. This command is not a new HTTP route, startup hook, or an extension to forced SSH permissions.

Each invocation scans at most 100 eligible rows. Repeat until `remaining` is zero. The selected rows are locked; source ownership is bound in the cloud key and metadata. The original bytes are uploaded, downloaded and compared before one atomic row transaction clears display content or replaces a data URI with the existing product-image route. Display IDs/playlists remain unchanged. Failed transfer/readback/quota/SQL updates roll back local changes; already completed rows remain valid. Interrupted uploads can leave an unreferenced cloud object; deterministic keys permit the same row to be retried. No cloud deletion or garbage collection is implemented.

Inventory counts eligible display BLOBs and product data URIs only, not all files. Invalid data URIs stop application with local source retained. External URLs, emoji, marketplace/AI image payloads, logos, avatars, filesystem files and historical PDFs are outside this slice. The CLI reports aggregate counts/verified byte totals, not customer identities or media bytes. Existing product-image account quotas remain enforced. Inactive product images remain inaccessible under the existing route policy.

## Required remaining work for the full owner request

1. Complete inventory of historical PDF originals and other storage adapters on the actual host, without exposing customer data or secrets.
2. Add a compatible private-cloud reader and an explicitly reviewed schema transition for immutable `shop_invoice_preview_files`. Do not disable its immutable trigger or regenerate preview PDFs as replacement originals. Existing encrypted backup/archive is not a live download adapter.
3. Backfill receipt/billing PDFs that have no saved artifact separately; rendering a historical receipt for the first time is not migration of an existing PDF original. No invoice numbering, fiscal state or payment mutation.
4. Implement remaining marketplace/AI/branding adapters based on their actual source formats and routes. No arbitrary fetching of external URLs.
5. Verify PR172 checks, backup and deploy compatible readers before applying media migration. Verify authenticated download/display behavior after migration. Do not represent test fixtures as real-provider acceptance.
6. Existing forced SSH permits status/backup/restart/deploy only. It cannot execute this migration. Use a separately authorized root-console operation; do not add a startup/deploy side effect to bypass that restriction.

Logical removal of BLOB/data-URI values can make space reusable in PostgreSQL after normal vacuum; it does not guarantee immediate filesystem shrink. Do not run VACUUM FULL, drop backups, or delete retained rollback/database files as part of this command. Measure actual storage separately. Existing backup retention is unchanged.

Validation: four disposable PGlite tests cover read-only inventory, cloud-reader round trips and stable display/product identities, corrupted readback rollback/retry, provider failure and bounded continuation. No production access/migration/deletion or deployment was performed.

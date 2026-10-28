# Automatic IDrive file storage — 28 October 2026

Owner authorized automatic invoice/image storage after successful direct-document activation. Screenshot 620 shows the real application SDK write/readback, deployment and final activation PASS. Live `/api/v1/shop/documents/status` subsequently returned `configured:true,available:true`. Existing backup activation remains separate and unchanged. No additional root activation or new credentials are required for the already active private-document service.

## This implementation, PR 172 (not deployed)

* Paid platform billing **email** PDFs are saved/read back through the existing private IDrive SDK before mail delivery. SQL keeps immutable transaction/company/source/digest/size metadata, not PDF bytes. Retries read the exact original bytes. Concurrent work is serialized per transaction; the current transaction company/status/number is checked under a shared lock. Provider failure leaves mail retryable, with no completed file record and no payment/number writes. PDF creation timestamps are fixed to the existing invoice date so retries are deterministic.
* New display images/videos use the existing authenticated, unlocked upload and capability-player routes. A separate SDK instance retains the existing 25 MiB media bound; manual documents remain limited to 5 MiB. New media keep SQL metadata and cloud references only. Existing database bytes remain readable. Same restaurant/media binding, hash verification, byte ranges and stable screen URLs are retained.
* Failed/successful media upload attempts have a durable 20-per-venue/100-global daily bound. Existing aggregate 250 MiB media quota counts both legacy and cloud entries. Removing media revokes player access and removes playlist references, but **does not delete remote objects**. No historical migration or cloud retention/deletion policy is added.

## Remaining work — do not claim complete invoice/image migration

This block does not yet connect the independent billing-account PDF download renderer, POS receipt/trade-invoice rendering, product images, restaurant logos or avatars. Their existing formats and access boundaries require separate adapters. It does not add public marketplace product-image uploads or issue new invoices. Historical files have not been moved or deleted. Private manual document uploads remain the already activated production feature.

## Validation

Local focused tests passed for automatic invoice immutable reuse, provider failure/retry, corrupt downloads, company binding and deterministic actual PDF output; display metadata-only persistence, legacy reads, wrong-venue rejection, corruption, failure accounting and quotas. Existing actual billing-mail/display-route scenarios passed with added cloud cases, including restart, original capability access and access revocation after deletion. The first full shop run contained two failed new test fixtures due to multi-statement prepared queries; those queries were split and both focused tests then passed. A complete corrected run and CI acceptance must be recorded separately before any deployment.

No production invoices, mail, media, financial data or configuration were changed by these tests. Existing credentials stay exclusively in protected runtime configuration.

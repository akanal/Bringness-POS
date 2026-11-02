# Verkäufer-Shops im bestehenden Bringness-Marktplatz

Owner request: complete the seller-shop workflow and deploy the verified implementation to the existing Netcup application. Preserve approved marketplace header, POS/waiter, merchant verification, product publications and payment restrictions.

## Workflow

`/shop/storefront.html`: use the existing account, load/create the company's one shop, choose name and stable unique lowercase address, add description and optional PNG/JPEG logo up to150KB. Save privately; a saved address cannot be taken by a different company or renamed accidentally. Publish requires an approved merchant and explicit confirmation of public branding plus already-verified business contacts. Saving privately or withdrawing removes only the shop page; offers and orders remain intact. Existing offers are reused through the existing seller filter, publication and item-detail flows, not copied or repriced.

`/shop/store.html?shop=<slug>`: public branded shop, optional logo, merchant-only published offers with bounded pagination, verified business contacts and existing payment notices. Empty approved shops can be published. Suspension or withdrawal removes the public shop and logo on the next request. Existing public merchant profiles link to the published shop. Entries are available from Mein Bringness, the merchant page and offer editor.

## Storage and safety

Authenticated owner/admin writes use the existing company lock and session recheck, expected revisions and durable request receipts. Retry uses the exact original command; account/view changes clear private UI and suppress stale responses. Slug uniqueness is enforced by PostgreSQL. Only public shop fields escape; no internal company/user IDs, merchant review notes or credentials are exposed.

Logos use the existing configured IDrive image store and bounded normalized PNG output; no local-disk/DB-byte fallback and no external logo URL/SVG. Durable upload reservations bound orphaned/retried writes and enforce account/platform quotas. Public image requests recheck publication and merchant approval after reading storage. Database holds metadata, not image bytes. Text-only shops can be created even if media storage is unavailable.

Existing body limits remain unchanged; only the dedicated storefront command has a bounded220000-byte JSON reader for a logo. Native tests use disposable PostgreSQL and synthetic storage, never a real merchant publication or IDrive upload. Live payments and incomplete legal texts remain separate prerequisites.

## Verification

Targeted SQL/HTTP tests cover draft privacy, approval/suspension, company and role boundaries, exact retry, stale revisions, reserved/stable addresses, logo storage/removal and no billing/publication side effects. UI tests cover large-logo retry, account-change clearing and escaped public content with seller-scoped reads. Native browser exercises private save, logo, reload, publication, existing product, responsive widths390/768/1280, suspension and withdrawal; shared header tests include both new pages. Complete acceptance and authenticated deployment evidence are recorded below.


## Verified release

PR [219](https://github.com/akanal/Bringness-POS/pull/219), feature985d1a9bd1f2dd5a316baf03879f74d9c599b1a2: all six triggered workflows green. Shop41443837015, successful job125274820409 (attempt2),751 tests passed without skips, actual PostgreSQL/Chromium storefront journey and shared-header assertions passed. The first attempt encountered a loopback socket reset in the existing product-image browser fixture; unchanged rerun passed. Four dedicated UI tests include clearing an already rendered private logo/preview on account change. Local root suite689 tests passed. Final mobile screenshot artifact13142346548 visually checked; new pages use the approved shared theme and bounded assistant icon.

Fresh authenticated backup41443103055/job125269559734 validated databases. Mergefedb7877b1096028a40088163b748709f987f76b deployed through Netcup41445507470/job125277469306; exact revision, previous container and database backup retained. Main Center and POS/AI integration checks also passed. Fresh public HTTP reads verified ten new/modified page/assets200 byte-identical; unauthenticated storefront401/no-store and nonexistent public shop404/no-store. IDrive aggregate availability remains configured=true/available=true. These verify delivery/readiness, not a real account publication, actual merchant-logo upload or productive payment. No real shop/account/order/payment was created by acceptance checks. Online payment and legal approval gates remain in force.

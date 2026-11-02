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

Targeted SQL/HTTP tests cover draft privacy, approval/suspension, company and role boundaries, exact retry, stale revisions, reserved/stable addresses, logo storage/removal and no billing/publication side effects. UI tests cover large-logo retry, account-change clearing and escaped public content with seller-scoped reads. Native browser exercises private save, logo, reload, publication, existing product, responsive widths390/768/1280, suspension and withdrawal; shared header tests include both new pages. Required complete suite and deployment evidence will be recorded after passing.

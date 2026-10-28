# Connected marketplace continuation — 2026-10-28

Builds on main2547ea3 (merchant approval/fulfilment already merged). The owner requested connecting the remaining marketplace flows while IDrive/server work stays deferred. This does not repeat the earlier approval package or activate payments.

## Twenty connected work and verification areas

1. Preserve existing registration, company owner/admin sessions and manual seller approval; verify their continued boundaries.
2. Add fixed login return destinations for the public marketplace and merchant workspace; no arbitrary next URL.
3. Connect the customer overview to merchant orders and the merchant workspace using the existing design.
4. Retain the existing homepage merchant-offers entry and merchant draft/application navigation.
5. Assign a durable independent public UUID to each seller; never expose the internal company UUID as that handle.
6. Expose only approved business contact fields and public UUIDs, excluding application/review internals.
7. Provide public profiles only for currently approved sellers with at least one live published offer.
8. Filter seller merchandise server-side by its stable public UUID.
9. Add direct product permalinks using the existing protected publication reader.
10. Show full product text, condition, GTIN when supplied, variants, availability and delivery details in the detail route.
11. Add delivery/available-stock filters and URL/back navigation while retaining search/category filtering.
12. Keep several merchant selections in one bounded tab cart, grouping by stable identity rather than matching names/email.
13. Quote and submit only the explicitly selected merchant; the backend still rejects mixed-merchant lines.
14. Preserve other merchants' cart lines after a confirmed order or exact-command recovery; legacy unbound lines remain visible and require explicit re-selection.
15. Show server-calculated product amounts, VAT and shipment line alongside the merchant total.
16. Confirm the recipient and merchant-specific unpaid total before handoff; preserve the existing frozen order snapshots.
17. Add company-authorized manual shipment references only to shipping orders already marked shipped.
18. Generate DHL links from one documented official template; other couriers are text-only, never arbitrary URLs.
19. Version tracking corrections separately from lifecycle state, retain immutable audit events and durable exact-command replay in one transaction.
20. Verify two merchants with identical public contact data, an independent customer, mobile/tablet/desktop ordering, tracking loss/retry/correction and PostgreSQL concurrency.

Items1 and4 retain and verify existing functionality. These are twenty connected areas, not twenty newly implemented production systems.

## Behavior and boundaries

Cart selection is tab-local and bounded to20 variant rows in total. The buyer explicitly chooses one merchant for each quote/confirmation. Each merchant has its own order, stock reservation, shipping charge and recipient snapshot. There is no cross-merchant payment or atomic combined checkout. A successful recovery removes only matching submitted lines/quantities; other selections remain. Legacy rows without stable seller identity are not guessed from names or email, silently erased or sent to a newly inferred merchant.

Public profiles require approved status plus an active publication; suspension/withdrawal removes public visibility. Current business data are distinct from original order snapshots. Seller contacts are not advertised as legally vetted beyond existing manual approval. No new real sellers, permissions or administrator memberships are provisioned.

Tracking is a merchant declaration, not a carrier event. Its own expected revision protects corrections, including lost acknowledgements and simultaneous edits. The order's original recipient, amounts, stock and paymentStatus=unpaid/canPay=false remain unchanged. Private tracking is returned only in the existing company-scoped buyer history or approved merchant inbox. No public order lookup, emails, labels, refunds, subscriptions, payment calls, shipping-provider API calls or delivery confirmation. A DHL link opens an external site only on explicit user navigation, with no-referrer/noopener/noreferrer. Official template reference: https://developer.dhl.com/api-reference/dhl-parcel-de-shipment-tracking-post-parcel-germany?language_content_entity=de

Local pending commands retain the existing account-token-hash binding and explicit identical retry. Tracking receipts must match request, order, next revision and exact canonical tracking values; invalid replies retain pending data. Account/visibility changes clear private forms; refused authorization clears private rows; uncertain failures retain explicitly labeled older information and entered tracking text. There is no background polling, silent mutation or automatic retry.

Online payments and real product-image storage remain separate work. IDrive and server configuration are explicitly deferred. No merge/deployment is performed for this package.

## Verification

Local full Shop suite reports682 passes, zero failures/cancellations/skips. The focused service/UI regressions pass, including independent raw-value validation for invalid quantities while request controls are disabled. Native Chromium/PGlite acceptance passed at390/768/1280: publication/recovery, separate selections and orders for identically named merchants, profile/product links, manual shipping references, dropped committed tracking response, exact retry, correction and company-scoped customer display. Final mobile buyer/merchant screenshots were inspected. All browser/provider fixtures use disposable data and canonical-Origin requests are routed solely to loopback.

Remote application/test headc274fc642e1f7db664dbad7496c7179893b763c5 has local tree591831eba5c9ab07854fb0b0dc4d0c9374aa2f2d. Actual-entrypoint PostgreSQL/native browser, simultaneous tracking replay/corrections and other applicable CI results are pending; record their actual outcomes before claiming them. See PR#167. Subsequent evidence-only updates do not change application behavior.

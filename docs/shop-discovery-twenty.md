# Approved twenty-point marketplace work — 2026-10-26

Owner explicitly approved the twenty proposed areas before implementation. The initial proposal accidentally included existing capabilities; this change preserves and verifies them rather than presenting them as newly built.

| Point | Actual implementation and limits |
|---|---|
| 1 Favorites | Existing session wishlist retained. No account synchronization claim. |
| 2 Recently viewed | Existing session history retained. |
| 3 Suggestions | Bounded query-dependent public product suggestions, including typo candidates. |
| 4 Typo search | One insertion/deletion/substitution/transposition for words >=4, only when exact text has no matches. No fuzzy numbers/codes. |
| 5 Categories | Existing category hierarchy retained and combined with the added filters. |
| 6 Price range | Inclusive net cents, comma/dot, rejects invalid/reversed bounds, unknown-price products excluded only when bounded. Periods remain separate. |
| 7 Location/radius | City and optional permission-triggered geolocation; local coordinates only, finite timeout and late-result guard. Only products with actual location metadata can match; current software has none. No geocoding service or fabricated addresses. |
| 8 Sorting | Existing price/name order plus publication date order when dates exist. Undated entries remain stable, no invented publication dates. |
| 9 Filter overview | Price/city/radius chips, individual removal and reset. Public price/city state roundtrips in history; coordinates never enter URLs or storage. |
| 10 Empty results | Explicit recovery and separately labeled search suggestions; filters are not silently weakened. Exact ad numbers never suggest a different number. |
| 11 Compare | Existing comparison and contract-period distinctions preserved. |
| 12 Gallery | Component supports up to eight dedicated same-origin product-media paths, selection, zoom and accessible labels. Current catalogue has no product photos: no gallery or category illustrations presented as product photos. Image upload/assignment remains open. |
| 13 Similar | Public same-category offers, separately retaining the existing alternative-base-licence section. No private seller drafts. |
| 14 Provider | Expandable current Bringness provider with its three public offers and existing imprint. Third-party verified profiles remain open; none invented. |
| 15 Contact | Product-specific mailto draft to info@bringness.de with clean ad link. Explicit manual sending in email app; no delivery claim. Internal messaging remains open. |
| 16 Report | Reason and bounded explanation prepare an email draft. No automatic transmission, moderation queue or removal claim; server-side moderation remains open. |
| 17 Preview | Existing text-only seller draft preview retained and shows private workflow note. |
| 18 Duplicate | Existing copy gets new identity and resets paused/sold preparation note. |
| 19 Pause/reactivate | Validated private workflow note survives local/cloud storage; returning to editing clears note. Public publication lifecycle remains open. |
| 20 Sold | Private sold note, never a billing event, stock adjustment or public sale claim. Public lifecycle remains open. |

Private workflow is an optional payload field. Absent/default values preserve canonical legacy payload and request digests; existing pending-command replay stays compatible. Existing revision locking, immutable listing numbers, account checks, archive/restore and history remain authoritative. No changes to backend publication gates, payments, POS, waiter app, provider configuration or AI keys.

The twenty areas are covered to the extent supported by the current catalogue/draft architecture. This is not a claim of twenty newly finished production marketplace systems. Complete public merchant publication requires verified profiles, approved publication/moderation rules and actual product/location/image metadata; those remain explicit follow-up work.

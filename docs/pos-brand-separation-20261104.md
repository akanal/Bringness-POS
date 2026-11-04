# POS public identity and advertising preparation — 4 November 2026

Owner requests independent Bringness POS public presence. Audit found prices, about and QR-ordering pages still declared marketplace canonicals; POS hostname redirected those pages, their assets and the interactive demo to the legacy application origin. Public product routes/assets now remain on the POS host. Established POS/waiter/table, authentication, billing callbacks and API origins remain unchanged. This separates marketing navigation, not all operational systems/accounts.

Prices/about/QR pages identify Bringness POS and their own-domain canonicals. About adds a product-team contact link to the existing demo enquiry. Demo, privacy and imprint navigation stays on POS. No personal founder names found on audited marketing pages; legal/operator records preserved. Existing working info@bringness.de mailbox is retained: no @bringness-pos.de mailbox has been verified or created, so a dedicated POS contact mailbox remains an external mail-configuration task.

Sitemap adds prices/about/QR to homepage and demonstration. Interactive demo stays noindex. Existing search-console ownership tag is retained. Local runtime and discovery regressions cover public on-domain assets, exact canonical URLs and preservation of operational redirects; full CI/deployment evidence follows separately.

## Official social profile audit

Both public search providers searched for Bringness POS profiles on Instagram, Facebook and LinkedIn, plus the owner's previously supplied generic Bringness Instagram/LinkedIn URLs. No dedicated official POS account could be independently verified. Existing generic Bringness profiles are not silently relabelled or published as POS-only sameAs links. New account creation, ownership confirmation and final profile addresses remain open. No social posting/account deletion performed.

## Google Search Ads — prepared, not activated

Destination: https://bringness-pos.de/vorfuehrung/
Display identity: Bringness POS; contact: Bringness-POS-Team.
Suggested initial geography: Berlin, German language, search network. No spending limit or launch date is inferred. Budget, billing and account access must be settled before activation. No tracking installed or conversion claims made.

Ad group: Kassensystem kennenlernen
Exact/phrase keyword drafts: [kassensystem gastronomie], "kassensystem restaurant", "kassensystem cafe", "kassensystem imbiss", "bringness pos".
Negative keyword drafts: jobs, stellenangebote, gehalt, crack, raubkopie, essen bestellen, lieferservice.

Responsive search ad headline drafts (at most30 characters each):
- Bringness POS kennenlernen
- Kasse, Service und Verwaltung
- Vorführung für deinen Betrieb
- Kasse und Team organisieren
- Tischservice mit QR-Code
- Belege und Auswertungen
- Bringness POS für Gastronomie
- Persönliche Demo anfragen

Description drafts (at most90 characters each):
- Kasse, Tischservice, Küche und Personal kennenlernen. Frage deine POS-Vorführung an.
- Für Café, Imbiss und Restaurant. Gemeinsam klären wir Geräte, Module und Abläufe.
- Artikel, Bestellungen, Belege und Auswertungen: Entdecke Bringness POS für deinen Betrieb.
- Deine Anforderungen zuerst: Vereinbare eine persönliche Vorführung mit dem POS-Team.

Sitelink drafts: Funktionen → /#produkt; Preise → /preise/; QR-Bestellungen → /qr-bestellungen.html; Über Bringness POS → /ueber-uns/.
No unverified fiscal readiness, guaranteed savings, free pilot, blanket availability or discounts advertised. Prepare only; activating paid ads requires the owner's concrete budget.

## Dedicated POS legal presentation

Final audit found the existing imprint/privacy pages use marketplace navigation and contain draft placeholders, not final legal texts. Dedicated /rechtliches/impressum/ and /rechtliches/datenschutz/ preserve the original main content exactly, use POS-only navigation and noindex,follow. POS marketing links point there; original marketplace legal pages are untouched. Regression compares legal main content byte-for-byte. Final operator/privacy texts remain a concrete launch blocker for paid campaigns; no legal compliance claim is made.

## Verified release

PR227 feature78baebf2674e22bab1f1cfd26e25a3a1638eefa8 passed all four applicable workflows; merge04ea2a5f8343ba3687f7354420213468c79f66b8 deployed through Netcup41914979738/job126872144467. Live audit then caught /ueber-uns/ returning404 from the existing actual static dispatcher. PR228 fixes that trailing-slash mapping and maps the dedicated POS legal directories explicitly; /brand-logo.js also stays on the POS host.

Final PR228 feature7d1a4ef2d12775829f96bf9a52c556d573457191 passed all seven checks across six workflows: checks41915603278, release41915603225, isolated41915603222, POS/AI41915603401, Shop41915603393 and Center41915603233 (Chromium and WebKit). All697 local tests passed. Legal-content regression preserves original main sections exactly. Merge dcf70e4ddc99746c98a80dd87da24805cace42ac deployed through Netcup41916653600/job126878021659; authenticated log confirms exact revision, previous container and database backup retained.

Fresh HTTP checks confirm all seven homepage/prices/about/QR/demo/legal pages200 on the POS domain, exact reviewed source after the expected existing brand-logo injection, own-domain canonicals and no personal founder-name matches. Sitemap200 now contains five POS marketing URLs. Browser verified prices, about and its contact navigation to POS demo; no purchase or enquiry submitted. Google session is currently signed out, so no additional Search Console re-submission is claimed; the previously registered sitemap URL is unchanged and now serves the expanded list.

Remaining concrete work: verify/create dedicated official POS social profiles; configure/verify a POS-domain mailbox (existing info@bringness.de retained); supply final imprint/privacy content and an advertising budget before paid campaign activation. Old bringness.com still requires All-inkl access. No complete separation of authenticated application/account/payment origins is claimed.

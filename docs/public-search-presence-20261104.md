# Brand discovery correction — 4 November 2026

The owner authorized retiring the old bringness.com food-delivery website. Its intended replacement is a permanent redirect to the bringness.de marketplace, preserving the agreed distinction from the POS product domain. No domain cancellation, hosting cancellation, database deletion or mail change is authorized by this content change. All-inkl KAS currently requires sign-in; no authenticated session or stored KAS/FTP connection is available in this workspace. The old site has therefore not been changed.

POS homepage canonical, Open Graph URL and organization URL now identify https://bringness-pos.de/. Marketplace homepage canonical and share metadata identify https://bringness.de/. Host-specific robots and sitemap responses run before the legacy POS redirect: POS lists its homepage and full demonstration page; marketplace lists its homepage and existing public offers page. Operational application links, callbacks and payment origins are preserved. Robots directives are discovery hints, not access control.

POS contact copy remains brand-only. Existing homepage cards now explicitly include personnel, duty planning, time stamping, receipts/invoices, reports and optional displays. No new pricing, readiness or contract claim is introduced. The full demonstration page remains the marketing destination.

Public searches could not independently verify exact current official social profiles. No guessed Facebook/LinkedIn/Instagram URL or fabricated sameAs structured data was published. Exact owner-confirmed profile URLs or authenticated profile evidence remain needed. Google Search Console ownership/index submission was not accessed; search ranking changes are not claimed.

Local verification: 693 root unit tests pass with no failures/skips; 12 focused routing, host separation, method/HEAD, sitemap, canonical identity and legacy route checks pass. `server/start.js` syntax and patch whitespace checks pass. GitHub checks and deployment are recorded separately after completion.


## Verified release

Feature 3a4cefecc1942060e51d160b42c8d82e4f49927a (PR225) passed all six GitHub workflows: checks41849400718, release41849400955, isolated41849400721, Center41849400735, POS/AI41849400738 and Shop41849401089. Authenticated pre-release backup41849492973/job126641650331 reports Database backups validated. Merge e1a3343ea81e0de4638464f8c3d1f72acd0cbe65 deployed exactly through Netcup41855859471/job126664163398; previous container and database backup retained.

Fresh public HTTP checks: both homepages200 with correct own-domain canonical; both robots and sitemaps200 on their own domains with exact expected URLs and no cross-brand redirects. Native Chrome confirms new POS title and personnel/receipt/report/display cards render correctly; screenshot inspected. All-inkl secure sign-in request timed out, and a fresh KAS tab still shows the login screen. Old bringness.com still returns its food-delivery page200 at /en. No old-site content or provider settings were changed; secure All-inkl authentication remains the blocker.

# Account design continuation — 2026-10-26

Owner supplied Screenshot (301).jpg: missing eye icon beside password and unattractive bottom account/back links. Read current production account/register sources before editing; the local imported reconstruction still had obsolete registration-unavailable wording and was not authoritative.

Implemented: inline SVG password eye shared by login and registration; accessible state/name and controlled input; icon reset on existing privacy, request and completion clearing paths; input space and keyboard focus; compact account headings; matching dark Bringness header and arrow; primary login action; two compact secondary navigation buttons replacing arrow-bearing footer text; registration recovery navigation; matching seller header and card styling; cache-versioned stylesheet and renderer imports. Existing login request, token checks, password clearing, registration identity, cooldown and error handling are retained. CSP remains restrictive, including img-src none for account pages; no external images or scripts added there.

Syntax checked on all five changed/new modules. Existing automated PR/deployment workflows supply further release evidence. No production credentials were entered and no real account was created for visual review.

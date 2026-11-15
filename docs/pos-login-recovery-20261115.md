# POS login and password recovery — 15 November 2026

Owner reports that both controls on /pos/ briefly flicker without feedback in iPad Safari. A previously authenticated desktop session does not reproduce or disprove this fault. The existing screenshot shows the default AK avatar, not proof of a valid session.

Confirmed failure modes and corrections:

- Previously both authentication handlers lived inside the full register script. If that script failed to load/parse, password recovery had no handler and the form fell back to a native GET submission. The separate early-loaded auth.js now owns login, registration and recovery; the form defaults to POST and submit/recovery stay disabled with a loading message until handlers are installed. No credentials are put in a fallback GET URL.
- Missing register startup is visibly reported as POS-START. Recovery remains available without the register program; successful login can persist the session and reload it. The reason the owner's original Safari main script failed is not yet independently observed.
- Authentication uses a fresh unauthenticated POST without stale POS bearer headers, while preserving same-origin access-gate cookies/HTTP authentication, validates confirmations, reports network/response errors and releases controls on deadlines, including a stalled response body.
- A late 401 from an obsolete initial session could clear a successful new login. Session/generation checks now ignore obsolete bootstrap results. Billing status at register startup also receives the existing 20-second abort deadline.
- A storage-blocked browser can continue with an in-memory owner session when the register is running. Waiter storage/redirect remains separate. Account eligibility, password policy, reset-mail backend and payment permissions stay unchanged.

Validation: focused DOM regression cases cover missing register script, silent response prevention, hung fetch/body deadlines, missing confirmations, blocked storage and expired-session races. Existing authentication/navigation checks and full default suite are required. Native Chromium/WebKit cases use the complete shipped POS page and extension chain, both fresh-login and deliberately broken-main/reload paths. The isolated preview additionally exercises the actual login/bootstrap server against disposable PostgreSQL. Deployment and live source verification are recorded after successful CI.

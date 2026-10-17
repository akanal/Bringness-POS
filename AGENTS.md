# Bringness project continuity

## Start here for every new development session

Use the existing repository and deployment configuration. Do not ask the owner to recreate an already configured server connection merely because a chat is new. Read this file, `.github/workflows/netcup-operations.yml`, and `ops/select-operation.js` before changing deployment configuration.

## Persistent access

- Repository: `akanal/Bringness-POS`.
- Production platform: Netcup. Railway is a previous platform; do not deploy there by default or remove it without a verified dependency and backup check and owner authorization.
- Existing automation: GitHub Actions workflow **Netcup operations**, `.github/workflows/netcup-operations.yml`.
- This workflow references existing repository Secrets `NETCUP_SSH_KEY` and `NETCUP_KNOWN_HOSTS`. Keep secret values in protected configuration; never copy them to chats, documentation, logs, or source files.
- Supported workflow operations: `status`, `backup`, `restart`, `deploy`; targets: `all`, `pos`, `ai`. Inspect the current operation selection code before triggering a request.
- The workflow uses an authenticated SSH server operation. A failed or unavailable VNC browser connection does not prove this automation is unavailable.
- Existing server application path: `/opt/bringness/app`; operation handler: `/usr/local/sbin/bringness-operations`; POS container: `bringness-pos`. Verify current server state before relying on older conversation reports.
- Public POS page: `https://bringness.de/pos/`; waiter page: `https://bringness.de/service/`.

## Verification and access limits

Read the workflow logs to confirm configuration readiness and successful authenticated operation. A workflow file alone does not prove that secrets are currently valid or that a deployment succeeded. HTTP 200 proves page reachability, not authenticated server access or functional correctness. Distinguish a committed change, successful tests, deployment, and live verification.

Browser sessions may expire. Preserve the existing server automation and connected account configuration rather than replacing them. If the current assistant environment lacks a required connector or permission, report that exact limitation; do not claim the server must be configured again. Never ask for passwords or private keys in chat.

## Working agreements

Continue authorized development autonomously and preserve established behavior and product decisions. Ask only for real missing access, required external approval, or an unresolved material decision. For the current display defect, remove only the unwanted six-character blocks; preserve POS/waiter logic, orders, data, and workflows. Verify the actual source before treating normal menu icons as the cause.

## Owner decisions confirmed 2026-10-11

- Ask the owner before changing visible design, colors, layout or interaction. Technical repairs may continue autonomously when the agreed design is preserved. The email-only invitation form and staff deletion action are explicitly authorized.
- Keep screen/background display content separate from product data. Product images render only as images in their intended field; image payloads must never be rendered as text. Verify image rendering before releases that affect it.
- Owners invite waiters with email alone; waiters provide their own names and personal access codes. Owners control restaurant permissions.
- Owners may revoke staff access or erase personal profiles with a deletion confirmation. Invalidate sessions and invitation/reset links; preserve orders, payments, receipts and required employment records using anonymized references where appropriate.

## Kellnerablauf bestätigt 2026-10-12
- Inhaber lädt per E-Mail ein. Kellner wählt Namen und eigenes Passwort, danach getrennte vierstellige Stempel-PIN mit Bestätigung.
- Passwort und Stempel-PIN können nur über getrennte, einmalige E-Mail-Links zurückgesetzt werden.
- Einstempeln ausschließlich an der Kasse mit Inhaber-/Kassensitzung; keine Stempelbuchung vom Kellnerhandy.
- Handy: Speisen und Varianten zuerst, zugewiesene Tische darunter, QR-Bestellungen bearbeiten darunter, Mehr als letztes für Signal/Steuerung. Küchennotizen pro Artikel.

- Kellnersignal: zwei Durchläufe, Startabstand fünf Sekunden, fallende Töne und synchrone Vibration. Optional melodischer Klingelton und Ansage „Sie haben eine Bestellung“; Ton und Vibration einzeln abschaltbar.
- Kellnerkopf ohne Begrüßung; Betriebsname und Abmelden ausschließlich in Mehr.

- Kellneransicht ohne Titel Service-Kasse. Speisemenü zuerst; Online/Offline in der schwarzen Kopfzeile (Dienststatus), Aktualisieren und Signal-Testmeldungen in Mehr. Bestellfehler bleiben an der Bestellung sichtbar.

- Kellner-Statuslampe: online grün, offline rot. Klingeltonwahl in Mehr: fallend, melodisch, Türglocke, sanfter Dreiklang, kurzer Aufmerksamkeitston.

- Mehr in der Kellneransicht: drei geschlossene Unterbereiche Mein Zugang, Klingelton & Vibration, Meine Dienstzeiten; Dienstplan innerhalb Meine Dienstzeiten.

## Owner scope confirmed 2026-10-12: Center and display control only
- Freeze the approved waiter app, POS interface, header and other POS areas. Do not alter their design, layout or behavior without explicit new authorization.
- Current work is limited to Center management/guest/kitchen/status/payment policy and the dedicated screen editor/player/backend. `pos/displays.js` is the dedicated display editor; do not modify `pos/app.js`, waiter/service files or shared styles for this work.
- Owners select onsite, online or guest choice per restaurant. Existing online policies are preserved until owners change them. Online choices require a verified merchant connection; the existing online checkout rollout switch remains unchanged.
- Onsite Center orders transmit ordering, preparation and pickup notifications; they do not initiate payment, generate a payment record or issue a paid receipt. Payment confirmation requires an actual payment linked to the same order, never a guest claim.
- A newly selected/uploaded single screen image or video displays indefinitely (`seconds:0`); switching to a timed playlist is explicit. A permanent item cannot be mixed with timed items. Preserve stable screen links and server media across restart.

- Kellner-Hintergrundmeldungen benötigen bestätigte Push-Registrierung; Fehler sichtbar unter Mehr. iPhone/iPad: Home-Screen-Web-App und Nutzerfreigabe. QR-Push mit hoher Dringlichkeit; vollständig ausgeschaltete Geräte empfangen keine Nachrichten.

- Push ohne konfigurierte VAPID-Keys: servergeneriertes Schlüsselpaar dauerhaft in waiter_push_identity, keine Schlüssel in Logs. Signal-Test sendet echte Push-Nachricht über den Server und zeigt Fehler; /health zeigt ausschließlich Bereitschaft.

- Kellnerkarten seitlich wischbar/aus Liste entfernbar mit Rückgängig, pro Mitarbeiter lokal gespeichert; Bestellungen/Küche/Abrechnung bleiben erhalten. Standby-Test nach 15 Sekunden trennt Anbieterannahme von Handy-Anzeigebestätigung. Diagnose maximal fünf Minuten im Speicher, bei Serverneustart erneut testen.

- Mehrere Kellner je Tisch/Bereich: Auswahl mit Häkchen, gemeinsamer Zugriff/QR-Push. waiter_employee_id bleibt Erstzuweisung, waiter_employee_ids speichert weitere IDs; aktive Kellner desselben Restaurants prüfen, Entzug/Sperren räumt beide Felder auf. Bestehende Einzelzuweisungen bleiben erhalten.

- Tischansichten POS/Kellner zeigen ausschließlich offene Bestellungen; bezahlte/stornierte Aufträge automatisch ausblenden. Belege und Abrechnungsdaten dauerhaft erhalten, kein Löschen von Bestellungen.

- Tresen: Gesehen ist Lesebestätigung; Abholbereit – Gast benachrichtigen ist serverseitige Freigabe direkt an der QR-Bestellkarte. Bezahlte, noch nicht abholbereite Tresenaufträge bleiben dort sichtbar. Kunde erhält Anzeige/Ton auf offener Bestellseite ohne App-/Push-Pflicht; Rückkehr-URL trägt Bestellcapability für Neuladen auch ohne SessionStorage.

- Abholbereit-Freigabe sowohl QR-Liste als auch geöffneter Tisch in POS/Kellner; APIs liefern Service-Modell/Abholstatus. Bezahlte Tresenaufträge bis Freigabe sichtbar, bereits bezahlte Beträge nicht erneut offen summieren.

- Kunde darf optional Abhol-App/Home-Screen-Web-App nutzen und explizit Push erlauben. /tisch/sw.js empfängt Abholmeldung im Hintergrund; Zustimmung je Bestellung, widerrufbar, Zuordnung maximal 24 Stunden. QR-Push-Worker persistent, Sendestatus/Retry in qr_guest_push, bestehender Center-Push-Schalter unverändert. iPhone: vom Home-Screen starten; Android auch Browser-Push.

- Korrektur 2026-10-13: Kunde soll keine App hinzufügen. Kein Installationsangebot/Manifest in Kundenseite. Android: freiwilliger Browser-Push. iPhone ohne bestehende Home-Screen-App: offene Bestellseite nötig; keine Zusage für Sperrbildschirm-Web-Push. Andere Kanäle erst mit geklärtem Anbieter/Kosten/Einwilligung.

## Owner package boundaries confirmed 2026-10-13
- Download base: 399 EUR net once; online base: 29.99 EUR net/month. Optional table-QR subscription: 29.99 EUR net/month for either base or restaurant.
- QR addon enables table ordering and service access, never Center, display control or personnel management. Center remains exclusive to restaurant. Preserve approved guest/waiter QR, reservation and counter/pickup workflows.
- Cancellation takes effect after the paid period: base packages lose table access/new QR ordering, retain ordinary POS and all stored orders/receipts. Restaurant keeps its tables.

## Fiskaly TEST onboarding 2026-10-14
- Dedicated owner/admin page: /pos/fiskaly-test.html; API /api/v1/fiskaly-test. TEST credentials only, authenticated connection check before encrypted persistence. No secrets or provider tokens in browser storage, responses, logs or source.
- Credentials are company-scoped in fiskaly_test_credentials. AES-256-GCM uses FISKALY_CREDENTIAL_KEY, otherwise existing PASSWORD_PEPPER or DATABASE_URL, with company binding. Preserve the encryption configuration across deployment; changing its source requires credential re-entry or a planned migration.
- Owner authorized TEST-TSE provisioning and one synthetic 10 EUR cash/normal-VAT signature on 2026-10-14. fiskaly-sandbox.js persists resource IDs, encrypted PUK/PIN, stages and sanitized signature proof separately in fiskaly_test_setup; never writes sales, orders, payments or receipts. Advisory lock serializes workers; restart reuses fixed IDs/revisions. No LIVE activation or contract.
- server/fiskaly-test-request.json identifies the specifically authorized API key by SHA-256 fingerprint, never plaintext credentials. Automatic onboarding runs only for exactly one matching configured company and request once. Other companies must explicitly start via authenticated POST /api/v1/fiskaly-test/setup. /health/fiskaly-test reports only aggregate state, technical phase and safe error code of this authorized rollout, no tenant IDs/secrets/proof. Detailed state/proof remain owner/admin-only. Preserve local TSE and approved POS/waiter/guest flows.

## Waiter absence and push scope 2026-10-14
- Owner authorized waiter standby-signal repair plus sickness, return-to-duty and vacation planning under Meine Dienstzeiten. Customer pickup notification remains unchanged.
- QR waiter pushes persist atomically with orders in waiter_order_push; explicit VAPID identity, high urgency, 30-minute expiry, bounded retry, stable order notification tag. Renew handset subscription on foreground/recheck instead of trusting the session cache indefinitely. Actual Samsung standby display still requires a handset test; provider delivery is not proof of audible display.
- staff_absences stores kind/dates/status only, no diagnosis. Waiters may report only their own sickness/return/request vacation. Owner/admin sees in-app events and receives queued email. Owner approves vacation and explicitly opts staff into replacement availability; administrative writes require existing personnel unlock.
- Reassignment preserves original shift owner, respects role, availability, absences, no overlapping shifts, 11-hour spacing, maximum 8-hour shift and conservative 40-hour nearby-workload cap. No suitable candidate means clearly open shift. Return restores original future schedule where conflict-free; never invents stamping entries or guaranteed staffing.

## Mail templates confirmed 2026-10-14
- Keep noreply@bringness.de as the configured sender. All application mail includes formal support text and Reply-To info@bringness.de; mailbox reception is a separate unverified setup.
- Application-owned templates render before Brevo SMTP submission, no Brevo API/template IDs or credentials in source. Invitation/password/PIN preserve existing one-time links and expiration.
- Paid platform billing events queue a deduplicated invoice PDF to the active account owner. Failed recurring payments only: one reminder after seven days; exact amount/subscription/status verified against Mollie immediately before sending, suppress after confirmed later subscription payment and on canceled/resolved events. No abandoned checkout reminders, fees, new debits or fabricated invoice numbers.
- billing_mail_events starts with future webhook events; no bulk historical mail. Preserve encrypted transactional queue, retry and ambiguous-submission review.

- 2026-10-14: Owner authorized subtle category colors in POS and waiter view. Shared stable category-ID palette; selected state remains explicit with border and weight. Preserve menu/order behavior.

- Waiter categories: owner authorized native horizontal swipe and dark selected category with white text, orange underline and check. Preserve horizontal scroll position when category contents rerender; POS category style unchanged.

## Hardware TSE procurement and deferred website follow-up 2026-10-14
- Owner wants permanently offline Windows POS supported by tested local hardware TSE. Swissbit Hardware TSE 2 USB is an evaluation candidate, not an integrated or released device.
- Integration/reseller inquiry sent to official sales@swissbit.com on 2026-10-14, requesting Windows SDK/redistribution terms, evaluation device, small-volume prices, lifetime, supply and support terms. Await actual response; do not invent contract or pricing.
- At the next website editing session, revisit the Download/pricing TSE section. After supplier conditions and Bringness compatibility are confirmed, offer a direct link to the exact approved model first; own accessory sales are a later option once procurement/delivery/support are settled. No immediate shop implementation requested and no premature purchase recommendation.
- Existing public price/download and pre-payment notices disclose separate hardware procurement and unfinished offline/TSE integration.

## TSE navigation confirmed 2026-10-14
- TSE belongs inside Settings, removed from More. Settings retains existing administrative PIN and manager/owner authorization. TSE direct module entry also requires the same administrative unlock; preserve timeout and lock on leaving protected modules. Service panel remains unchanged.

## Modular sales model confirmed 2026-10-15 (supersedes old restaurant package boundaries)
- Two base products only: online 29.99 EUR net/month and Windows download 399 EUR net once. Retire restaurant tariff for new purchases; never reprice or revoke existing subscriptions automatically.
- Base includes ordinary cash register and necessary administration only. Tables, kitchen, table QR, display control and personnel are separately bookable paid modules, including for download base. Tables and kitchen are independent modules; no generic restaurant package. TSE separately priced once supplier terms are known, not a claim that fiscal protection is optional for production.
- Preserve existing functional implementations, UI workflows, stored orders/receipts/employees and prior data. Change only module allocation, entitlement checks and booking/activation.
- Module booking/management belongs in Settings, requires owner role plus existing service/administrative PIN. Send time-limited single-use confirmation to verified owner email. Email GET must not itself activate purchases. Show exact product, price and duration; activate paid modules only after explicit confirmation and verified provider payment. Staff cannot book modules or incur charges.
- Prices for new modules remain proposals, not approved live charges: tables 9.99, kitchen 9.99, displays 9.99, personnel 14.99 EUR net/month. Existing QR proposal 29.99 EUR net/month. No guessed final prices or automatic billing migration.

## Owner correction: TSE included in online base 2026-10-15
- Supersedes the separate online TSE pricing decision above: online base stays 29.99 EUR net/month including Cloud-TSE, not a paid optional module. Supplier contracts/pricing and real payment/server/support costs still require margin validation; no claim of live fiscal readiness.
- Download base stays 399 EUR net once; inclusion of physical TSE has not been decided. Keep hardware procurement costs separate pending confirmation.

## Final online base price confirmed 2026-10-15
- Owner explicitly approved publishing 34.99 EUR net/month (41.64 EUR incl. 19% VAT) for new online base purchases, including Cloud-TSE. Supersedes 29.99 online base. Existing customer subscriptions and agreed special prices remain unchanged; recurring amounts continue from the paid transaction/provider contract. Download remains 399 EUR net once; QR price is unchanged. Clearly disclose that productive TSE activation remains pending. Modular sales migration is a separate unfinished change; do not describe it as deployed based solely on this price update.


## Owner final modular catalogue confirmed 2026-10-17
- Supersedes earlier proposals: online base 34.99 EUR net/month, Windows download 399 EUR net once. Both base licences allow the same monthly addons. Retire restaurant_monthly from new purchases only; preserve existing contracts and stored business data.
- table_management_monthly: 9.99 EUR net/month, independently bookable without QR.
- table_qr_monthly, counter_qr_monthly, center_monthly: three distinct systems, each 29.99 EUR net/month, each requires the table module plus a base licence. Preserve Center separation from the other QR systems.
- personnel_monthly and kitchen_monthly: each 9.99 EUR net/month, independently optional; neither belongs in the ordinary base POS. A retail/newsagent base has no kitchen.
- Booking starts in protected owner settings with administrative PIN, time-limited single-use owner-email confirmation and verified provider payment. No automatic migration or repricing of existing subscriptions.
- Owner explicitly authorized publication of these exact prices and modules in this session; no further routine confirmation is needed.

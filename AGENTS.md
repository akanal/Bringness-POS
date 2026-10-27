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

## EAN-Scanner owner approval 2026-10-17
- Separate optional ean_scanner_monthly module, 9.99 EUR net/month; feature ean_scanner. Online and download bases, no table requirement. Hardware separately procured, keyboard-wedge scanner with Enter supported. Public compact price card and POS licensing card required.
- Code assignment is restaurant-scoped, validated EAN/GTIN 8/12/13/14 including check digit and leading zeros. Existing product assignment or explicitly entered new name/price/tax; no automatic product/price database. Owner/admin plus existing PIN required to assign. Paid module plus base enforced server-side.
- Known scan adds to ordinary cart; repeated scans increase quantity. Unknown/unavailable code never automatically sells. Offline sales use immutable synchronized barcode/catalog entries and bounded module validity; offline unknown codes require online assignment/sync. No checkout/receipt logic replacement.

## Owner module booking safety confirmed 2026-10-17
- Active addon cards move from available offers to Meine Module with status, price and management; public prices stay visible.
- Prevent duplicate purchases server-side, including simultaneous tabs/devices, pending payments, ambiguous provider replies and paid periods after cancellation. Never rely on hiding buttons alone.
- Display control price confirmed separately: 14.99 EUR net/month, not 14.90; feature display_control, base required, no table dependency. Preserve legacy restaurant display rights and all stored screens/media. Paid module gates both editor and public player/media.

## Formal email address confirmed 2026-10-17
- Owner confirmed successful receipt and flow of the owner/module approval email. This is delivery feedback for that test, not proof of all recipients or purchases.
- Always address recipients formally with Sie/Ihr in Bringness POS and AI emails, including subject, HTML and plain text. Preserve links, expiry, approval and payment behavior.

## Free Händler option approved 2026-10-18
- Under Mehr → Händler, freely switchable without a paid addon. Operator-defined independent wholesale gross unit prices and quantity tiers, large quantities, recipient-bound DIN-A4 invoices with the existing receipt identity and QR. Preserve ordinary POS prices/cart, paid modules and provider safeguards.
- The eight uploaded retail POS photos are functional references, not an instruction to copy their old visual design. Modern dedicated trade view is authorized; unrelated POS/waiter design remains frozen. First accepted block: wholesale prices/tiers and A4 invoice; remaining photo functions require explicit status tracking.

## Discounts and parked bons approved 2026-10-18
- Owner authorized cart-wide EUR/percentage discounts and named server-side parked bons for ordinary POS and the free wholesale view. Preserve existing licensing, ordinary unit prices, provider/card guards and Windows offline behavior.
- Discounts must be validated/calculated server-side and allocated to original lines cent-exactly across VAT rates; preserve original unit prices and record the adjustment in receipts, exports and prepared fiscal data before the receipt INSERT trigger runs. Positive remaining sale total required.
- Parking is an unpaid draft, never a payment/order/receipt. Tenant/restaurant scope, optimistic update versions and an atomic paid transition prevent duplicate settlement of a resumed bon. Retain uncertain save/payment request identities across retries.

## Retail/trade separation confirmed 2026-10-18
- Free Händler option is optional and defaults off per restaurant. Owner/admin enables it in protected Settings using the existing administrative PIN; no paid addon, email purchase or charge. Only enabled restaurants show Händler under Mehr. Server checkout rejects new trade sales while disabled; already committed request replays remain valid. Disable never erases tiers, drafts, orders or receipts.
- Pfand/Leergut belongs in ordinary retail (including newsagents selling drinks) AND wholesale; wholesale additionally needs large quantities/crates. It is still an open development item, not implemented by this toggle. Retail discounts and parked bons remain independent of trade activation.
- Eight reference photos were re-inspected against main 19051bc; see docs/retail-trade-gap-20261018.md for explicit implemented/partial/missing status. Do not label photo functions complete based on menu entries. Next blocks: customer master records/outgoing delivery notes, deposit/returns in both modes, full cash opening/closing and reporting.

## Customer/delivery block authorized 2026-10-18
- Preserve the agreed order: customer master records and outgoing delivery notes precede deposit/returns and cash closing. Customer administration/delivery notes are independent of the optional free trade toggle; wholesale can reuse saved recipients.
- Delivery notes are unpaid quantity documents, not invoices, sales or stock dispatches. Retain immutable sender/recipient/product snapshots and durable request identities. Preserve ordinary receipt versus trade A4 invoice behavior.
- Owner deferred deployment after the trade-toggle SSH timeout. Do not merge/deploy this new block without release authorization. See docs/customers-delivery-20261018.md for verified status and limits.

## Cash closing block authorized 2026-10-18
- Owner authorized cash opening/closing, deposits/withdrawals, counted cash and differences for retail and trade; live publication remains deferred.
- See docs/cash-closing-20261018.md for server-arrival assignment, offline/unassigned-payment limits and verification. Do not describe this as a complete fiscal Z report.
- Current cash branch depends on unmerged customer/delivery PR #90. Owner subsequently explicitly authorized GitHub storage of the cash and invoice work; remote head 5260050 contains both. GitHub saves of agreed development are authorized without repeated routine permission. Production merging/deployment remains separately deferred.

## Wholesale corrections confirmed 2026-10-19
- Owner requires an independent running invoice series for wholesale versus ordinary POS. New trade sales use HR-year-counter from trade_invoice_number_seq; retail retains BN and receipt_number_seq. Existing receipts and replayed requests keep their original number, no retrospective renumbering. The counter is global like the existing retail sequence and does not reset annually; PostgreSQL sequence gaps after rollback are possible.
- Unconfigured wholesale articles must provide an active route to PIN-protected price setup, never silently inherit retail prices or book a zero-price sale. Keep stored trade recipients reusable through customer records in a compact collapsed panel. New changes require separate production release authorization.

## Deposit/returns block authorized 2026-10-19
- Owner requested discreet Pfand/Leergut for ordinary online POS and wholesale, including per-article/per-package quantities, automatic separate charges, original-price returns, checkout credit or cash refund, receipt and cash-report separation. No production release authorized for this new block.
- Configure explicit gross cents, units and tax in protected owner/admin settings with session-bound administrative PIN; no guessed tax rates or automatic retail-price change. Discounts apply only to merchandise. Keep immutable charged unit/tax/quantity snapshots; never reprice returns from the current product rule.
- Credit returns inside the checkout transaction with original-line quantity limits; pure payouts require an open cash session with sufficient recorded cash. Persist and replay request IDs; no refund twice after uncertain network acknowledgements. Rule changes and return identities are retained.
- This block is online POS only. New Windows offline snapshots exclude configured deposit articles; a still-valid immutable catalog containing the article blocks configuration changes until expiry. Historical verified offline imports remain unchanged. QR/table writers reject newly configured deposit items rather than selling them without deposit calculation.
- Separate return journal for owner and scoped read-only accountant grants marks credit already included in a sales receipt to avoid double deductions. No productive TSE activation, full fiscal Z or official DSFinV-K claim. Returns without an original Bringness deposit record remain unsupported. See docs/deposit-20261019.md.

- Deposit release also requires the backward-compatible AI sales/forecast readers that exclude null-product financial lines. Deploy the AI reader update before enabling deposit configuration; preserve existing supplier/provider/runtime settings. No new AI feature activation or external procurement.

## POS colour coding approved 2026-10-20
- Owner approved consistent POS colour coding: orange primary actions, soft blue selection/management, green confirmed states, red errors/destructive actions. Preserve table/connection status meanings and plain document/print styles. Keep labels alongside colours.
- Customers and delivery notes belong inside Händler; remove the duplicate Mehr menu entry. Existing bookmarked customer route remains compatible. Owner authorizes publication after successful checks without another routine confirmation.

## Simple drinks deposit approved 2026-10-20
- Configure beverage deposit in the product three-dot menu: enable, gross amount with presets, explicit tax selection. Remove the old multi-field settings card. No name/category heuristic restricts products; the owner selects which drink carries deposit.
- Preserve recorded charges, original-price returns, audits, PIN, uncertain-payment protection and existing multi-unit rules. New rules use one unit, existing units/labels/tax persist. No automatic tax assumption or live payment test.

## Native modal administrative PIN fix 2026-10-20
- Native dialog.showModal makes body siblings inert regardless of z-index. Mount the existing personnel overlay inside an open native dialog when present so administrative PIN entry remains visible and interactive. Escape cancels only the PIN gate; a cancelled/incorrect PIN never writes a deposit rule.
- Browser regression must exercise actual personnel.js (not an always-true unlock stub), cancelling then retrying with wrong and correct fixture PIN and checking the session-bound unlock header on exactly one write.

## Basket deposit display and compactness approved 2026-10-20
- Owner screenshot has 3 drinks at 2.99 = 8.97 plus 0.75 deposit already in 9.72 total. Show deposit separately in the basket with quantity, unit and line total; do not charge it a second time or change historical documents. Keep deposit display rows separate from clickable merchandise rows/numpad quantities.
- Remove the two lower sales-tool panels from the basket; retain their functionality under Mehr > Kassenoptionen. Remove the initial keypad instruction but retain actual validation/status messages. Reduce internal basket spacing.

## Aggregated deposit and direct keypad approved 2026-10-20
- Retail basket shows one total line labelled Pfand, independent of product names or tax groups. Underlying immutable charge/tax records and receipt positions remain unchanged.
- Keypad applies every digit/backspace immediately. Remove its Übernehmen action. Clearing cash tender clears the stored amount; clearing a selected quantity removes only that article. Quantity edits recalculate deposit and total.
- Payment button availability must recover after async deposit load and basket edits, while retaining busy-state, uncertain-payment replay and pending-refund protections. Card payments still require the established verified terminal integration.

## Deposit pieces and cash difference approved 2026-10-20
- Keep one Pfand total, additionally show the charged piece count across all configured products (including their configured unit multipliers). Counts do not alter amounts or historical charge/return records.
- Keypad tender summary shows Noch zu zahlen for underpayment and Rückgeld for overpayment, calculated in integer cents against the total including deposit/discount. A typed zero shows the full amount due; clearing the field hides the summary. Never accept an underpayment or create another payment to display the difference.

## Navigation, PIN scope and deposit grouping approved 2026-10-20
- Always start at Kasse, ignoring stale view URLs and payment-return auto-navigation; billing state still comes from the server. Subsequent bootstrap refresh preserves the current view. Artikel opens its permanent product form directly on the first click; late billing/PIN responses cannot supersede newer navigation.
- Additional administrative PIN protects Einstellungen, not ordinary module navigation, authenticated owner/admin personnel operations, barcode/deposit assignment or wholesale price edits. Keep session validation, owner/admin roles, tenant isolation and audit. Restaurant branding/mode/QR settings, billing-profile changes and contractual module approval retain their established extra authorization. Personal employee stamping PINs remain unchanged.
- Group basket deposit lines by charged unit amount across products. Different amounts get different lines with count and unit price; preserve immutable tax-specific backend records. Credits remain separately identified.

## Receipt deposit grouping approved 2026-10-20
- Group receipt/PDF/QR display deposit rows by charged unit amount across products and put them after all merchandise, before totals. Different amounts remain separate; return credits remain distinct. Labels are Pfand and Pfandrücknahme.
- This is presentation only: preserve original order items, charge/return identities, payments, discounts and per-line VAT rounding. A4 net rows sum original net amounts; a mixed-tax deposit group explicitly marks its unit price as gross. Previously downloaded PDFs remain unchanged; a newly rendered document uses the updated layout.

## Recipient address plausibility approved 2026-10-20
- Red field/text warnings compare German postal codes and city against a bundled GeoNames reference in customer, delivery and trade recipient forms and delivery preview. Missing street/house-number components are flagged. This is not street/house-number existence or deliverability verification; state that limitation in the UI.
- No customer address/name/email is sent to an external provider. `/api/v1/address-check` is authenticated owner/admin/manager-only, bounded, read-only and returns no customer records. Unsupported countries, missing reference data and network failures are unverified, never successful validation.
- Warnings are advisory because aliases, special postcodes and source gaps exist; do not change recipient values automatically or gate a cash sale on lookup availability. Keep uncertain delivery/payment replays immutable. Source, date, license and regeneration instructions are in server/data/README.md.

## Compact delivery address approved 2026-10-20
- Delivery-note preview recipient inputs have no ordinary underline, tight line spacing and PLZ/Ort on one row. Keep direct editing, accessible focus outlines and the red invalid-address borders/text. Scope this styling to the preview address, not product search or ordinary recipient forms.

## Smaller delivery window approved 2026-10-20
- Reduce delivery preview text to 13px with compact padding/headings and remove the artificial minimum paper height. Keep the window within the viewport; long documents scroll without discarding rows. Article rows alternate light gray/white in preview and printed delivery notes. Preserve editing and red address warnings.

## Weak photographed-document OCR follow-up approved 2026-10-21
- For low-confidence OCR, a bounded sparse second pass may reconstruct observed horizontal fragments only if confidence improves and every already recognized quantity/unit occurrence survives. Preserve the previous OCR text across draft reloads and show it in the existing original-text disclosure. No image crop or external OCR service.
- Labelled delivery dates in joined columns may be proposed; conflicting or invalid dates remain empty. Invoice references are not delivery-note references. Keep exact-name matching, unknown net prices, manual review, tenant/stock/payment guards and immutable completed imports.
- Real-photo evidence and remaining practical limits are in docs/real-document-check-20261021.md. Languages, Windows signing and simplified deposit returns remain paused; owner confirmed Mollie test/activation success, not productive payments.

## Owner continuation confirmed 2026-10-21: development now, acceptance later
- Keep one deduplicated practical acceptance checklist at docs/test-backlog.md. Further functional/device acceptance is deferred by the owner while development continues. Do not describe already implemented Offline/Admin/Accountant/AI functions as missing development.
- Time input and display use explicit 24-hour HH:MM without AM/PM, independent of browser locale. Preserve the existing device-timezone-to-UTC conversion for dated events and shifts. Further form changes stay on a development branch until their deferred acceptance is complete; no untested live publication.
- Mollie test/activation is owner-confirmed. Windows signing and productive TSE remain dependent on their separately deferred external prerequisites.

## Automated verification resumed 2026-10-21
- After the owner requested execution, automated development checks were resumed for PR112 and stacked draft PR113. Preserve the current evidence in docs/development-validation-20261021.md and practical-only rest points in docs/test-backlog.md; do not describe all functional tests as still deferred.
- PR113 branch fix/offline-payment-recovery-20261021 contains original-catalog payment recovery, active-company/device history/export/replay boundaries, short-lease refresh and atomic local view reads. Source/test checkpoint is 88c32b17d684f436769517b54ad917f9b341f70e. No productive deployment or public installer release is implied.

## Local collection resumed by owner 2026-10-21
- Latest owner instruction: collect the next ten development blocks locally, without upload or deployment. Additional functional tests remain deferred. Syntax/patch checks are allowed and must not be described as functional acceptance.
- Preserve previous eleven local commits at 65efc5b on fix/stock-queue-fairness-20261021. The next collection is on work/stock-recovery-next-ten-20261021, described in docs/local-stock-next-ten-20261021.md with shared deferred cases under T04/T12.

## Fifth local stock development package
- Continue local collection without GitHub upload or deployment. Latest package builds on 0191c20 in work/stock-arithmetic-fifth-ten-20261021; preserve all previous local commits.
- docs/local-stock-fifth-ten.md records ten related arithmetic/authority changes. Physical signed stock remains supported. A financial refund still does not imply returning unused ingredients. No new module, layout, provider, or contractual change.

## Local sales stock ledger continuation 2026-10-22
- Local branch work/sales-stock-ledger-next builds on 0e13528. Preserve prior packages; no upload/deployment.
- Sales use exact ingredient accumulation followed by the existing nearest rounding (negative exact halves toward zero); kitchen keeps its separate upward rounding. Reversals use immutable saved effects, never the edited recipe. Financial refunds do not imply ingredient returns.
- Evidence and limitations: docs/local-sales-stock-ledger-next.md; deferred acceptance remains consolidated in docs/test-backlog.md. Local automated checks passed; true parallel-session authority checks and device acceptance remain open.


## Wholesale invoice QR continuation 2026-10-22
- The owner requested a QR code that opens the concrete stored invoice. A4 invoices use a separate random `receipts.invoice_public_token`; never reuse the ordinary `public_token` or receipt/order IDs for access to recipient details.
- The authenticated invoice download assigns the invoice capability once, with active owner/admin/manager session and tenant checks under shared user/session locks. Repeated/concurrent downloads reuse it. Existing receipts are not bulk-published.
- `/rechnung/:token` is a read-only PDF capability route for exactly one stored trade invoice. It uses immutable recipient/seller snapshots and actual stored payment records, has no listing operation, and sends no-store/noindex/no-referrer headers. Ordinary `/beleg/:token` links remain unchanged. Do not log capabilities or copy them into source.
- The nullable column and unique partial index are added by `migratePublicReceipts`. Preserve the column across releases; already downloaded PDFs retain their previous QR, while a newly rendered A4 invoice receives its dedicated link.
- Verification: `server/trade-invoice-link.test.js`, PDF tests and `server/ai-tests/trade.mjs` cover invalid links, capability separation, retained invoice identity, concurrent reuse, revoked-role issuance and safe renderer failures. A real handset camera scan remains a device acceptance task.

## Customer picker and bank-field simplification approved 2026-10-23
- Remove the separate customer search field/button. Keep saved-customer selection, address reuse and versioned save/update; preserve the backend search API for existing consumers.
- Seller BIC is optional and distinct from the German bank sort code (BLZ). Explain this beside the field, accept formatting spaces, and report numeric eight-digit sort-code input clearly. Never silently replace or discard a bank reference or weaken IBAN checksum validation.

## Seller address and payment feedback correction 2026-10-23
- Keep a seller-company address editor in wholesale Customers & Documents using the existing billing profile endpoint and management authorization. Saving it must retain the current cart and customer; never copy customer data into seller fields.
- Cash confirmation failures stay visible in the open invoice draft. Close the draft only after success; disabled/blocked checkout must return an explicit failure. Keep existing immutable uncertain-payment replay and server confirmation checks.

## A4 barcode, address warning and compact deposit revision approved 2026-10-23
- Owner replaced the A4 invoice QR with a linear barcode of the exact immutable invoice number, above the customer address. Use Code 128 to retain letters and hyphens; do not invent an EAN-13 number or encode a URL. Thermal/public ordinary receipt QRs remain unchanged. Existing invoice capability routes remain compatible with previously downloaded documents.
- The inline seller company address uses the same advisory PLZ/place checks as customer addresses, including visible warnings and clearing on edit. Do not rewrite addresses from reference data or treat the plausibility reference as proof.
- Display financial deposit/return rows with smaller regular type and reduced height on A4 and its draft; merchandise styling, grouped amounts, tax rounding and recorded payments stay unchanged.
- Verification includes exact-number decoding of a rasterized generated PDF with independent ZXing, PDF one/multipage layout, compact-deposit totals, company PLZ/Ort warnings and historical invoice access tests. Actual printed-device scanner acceptance remains a device check.

## Compact invoice archive and barcode lookup approved 2026-10-23
- The invoice barcode contains the invoice number. In Customers & Documents → Archive, focus the invoice-number/barcode field and scan using a keyboard-wedge scanner followed by Enter, or type the number. A unique exact match opens its saved PDF; partial queries show up to 20 scoped results. Never load every invoice by default; keep delivery notes collapsed and only the latest-sale shortcut on the sales view.
- Search is server-side, parameterized and applied before the limit; preserve tenant/restaurant/role checks and legacy API listing callers. Ignore stale replies and stale PDF openings after edits/navigation. Do not turn an archive lookup into a financial write.
- Do not add deletion for issued/booked invoices. Corrections or cancellations require preserved original records and an auditable process; no new cancellation workflow is implied by the search change.

## Permanently visible invoice scanner field approved 2026-10-23
- Put the invoice-number/scanner search directly in the wholesale sales panel above deposit returns, outside collapsed Customers & Documents/Archive sections. Archive redirects focus to this same field; never duplicate it or fetch all invoices on initial render. Select its existing contents on focus for the next scan.


## Unpublished collection requested 2026-10-23
- Owner explicitly wants to collect changes in code and not upload or deploy until their later signal. This supersedes previous automatic live-release requests for the new package. Do not push main or trigger deployment for this collection.
- Variant extra rows keep the remove button directly beside the name/price, with an 8px gap, aligned and wrapping on narrow screens.
- Deposit return keeps the existing original-receipt lookup, quantities and explicit cash-payout or cart-credit choice. Enter in original receipt input performs lookup. The standard reason is retained behind “Grund ändern”; archive controls are collapsed. Credit removal is shown only with credit; local-reset recovery only with a pending request. Preserve durable request identity, replay, settlement lock and server verification.
- Local checks passed: deposit UI including recovery visibility and Enter lookup; trade UI; customer/delivery UI and database integration; Center simple UI/onsite database flows; display persistence; 68 Center/display/owner unit checks and 61 AI demand/forecast/procurement/authorization checks. No physical scanner/display acceptance or real sale was performed.
- Full issued-invoice cancellation remains unimplemented. Existing open-order cancellation is not an issued-invoice reversal. A future implementation needs immutable linked reversal documents, request idempotency, tenant/PIN authorization, accounting/cash movements, inventory/deposit reversals, and explicit provider refund handling. Do not claim a cancellation button exists or delete original invoices. No real invoice was canceled in this collection.


## Local invoice cancellation review 2026-10-23
- Continued owner-authorized local development; no upload or deployment. Stored invoice dialog now offers “Storno prüfen”, explicitly a read-only preparation, not an issued reversal/refund.
- GET /api/v1/trade/invoices/:receiptId/cancellation-review requires active owner/admin/manager access and company-scoped wholesale receipt. All writes return 405. A repeatable-read read-only transaction collects original line/payment/discount/deposit data consistently; no number allocation, stock event, cash movement or payment write.
- Negate already-rounded historical net/tax/gross values; do not re-price, recompute negative rounding, or equate financial refund with ingredient return. Check paid status, line/payment reconciliation, non-cash methods, already returned deposits and credited deposit returns. Every response has status review_only and canCancel false even when amounts reconcile.
- UI escapes stored text, rejects mismatched receipt identity, displays errors and ignores replies after dialog close. The PDF remains available; responsive modal bounds checked at 1366/390px in actual Chromium with a fixture PDF.
- Verification: 12 focused cancellation/PDF/receipt-line unit tests; actual HTTP/database wholesale integration (including unauthorized, wrong-role, foreign-company and write denial); invoice UI with failure/retry, text injection and late response checks; Chromium scan/review/close/responsive test. No production mutation or physical-device acceptance.
- Actual linked reversal issuance, idempotent cash/provider refund booking and accounting integration remain to implement. Do not advertise this review as completed invoice cancellation.


## Local ten-step cancellation-draft block 2026-10-23
- Owner requested continuation in groups of ten. Continue collecting locally; no GitHub upload or deployment until a new live instruction.
- Completed: (1) receipt-linked draft schema, (2) immutable financial review snapshot and author/time, (3) bounded reason validation, (4) owner/admin + session-bound PIN enforcement, (5) fresh locked session/role validation, (6) request/receipt deduplication with PostgreSQL advisory locks and unique constraints, (7) reload-safe pending request identity, (8) saved draft reopening, (9) explicit draft-only UI/error/closed-view handling, (10) unit/HTTP/database/UI/native-browser verification.
- GET/POST /api/v1/trade/invoices/:receiptId/cancellation-draft; one draft per receipt, unique company/request identity. Same body replay returns stored draft, conflicting request/reason returns 409. GET retains owner/admin/manager read scope; POST owner/admin only. No update/delete or financial execution endpoint added.
- Storage failures roll back. Draft creation requires review without issues. Stored snapshots remain the historical draft, not proof that a later execution is still permitted; execution must freshly verify all payment/deposit/accounting state.
- `trade-cancellation.js` loads with the wholesale scripts. Review exposes the draft area; saving requires a reason and the existing administrative unlock. Lost replies preserve the exact body locally before sending. Reopening retrieves the server draft. Validate receipt/request identity before acknowledging even a closed dialog response; do not erase another pending local identity.
- Checks passed: 10 focused unit tests, actual HTTP/PGlite trade integration including migration re-entry, missing/wrong PIN, manager/role revocation, foreign tenant, payment mismatch, injected write rollback, replay/conflict and preserved payments/order; JSDOM UI recovery/escaping/corrupt local state; actual Chromium scan/save/reopen at 1366px/390px. Truly concurrent separate PostgreSQL sessions were not tested; constraints and lock calls are implemented, not a claim of concurrency acceptance.
- Actual issued reversal document, fiscal handling, final accounting/cash/provider refund execution remain unimplemented. No real customer invoice was canceled, no real refund sent, and no live changes made.


## Release authorized 2026-10-23
- Owner explicitly requested publishing the entire collected package before starting a new project. This supersedes the no-upload/no-deploy hold for the variant/deposit/cancellation review and draft collection through local commit 866aaa7. Use the existing Netcup release pipeline. Issued cancellation and actual refunds remain unimplemented; do not describe drafts as booked reversals.


## Independent Shop live release — 2026-10-25
- Source of truth for Shop is repository main: PR #137, followed by canonical-origin correction 262d2309956252580cdc4e535a3dc572eb2324c1. Do not restore/deploy the earlier Library reconstruction over the current application.
- Public canonical URL: https://bringness.de/shop/ . bringness-pos.de redirects there; registration Origin must match bringness.de.
- Actual Netcup publication succeeded in runs 40245574911 and 40245934682; previous containers and database backups were retained. No AI deployment was requested.
- Registration/account access, quotes/drafts, prepared checkouts and history are integrated. Payment dispatch, public payment callback, final invoice issuance and new Windows delivery remain blocked and explicitly labelled; do not call this sales-ready.
- The 508-check shop suite and real current entrypoint with disposable PostgreSQL/Chromium passed before the first release; the canonical-origin repair passed 18 targeted checks, deployment checks and subsequent live probes. No production fixture accounts or financial data were written for acceptance.
- Preserve existing POS/waiter/AI pages, price/password helpers, contracts, configuration and Netcup automation. Continue from current main, not reconstructed root files. See docs/shop-live-integration-20261025.md.


## Company seller draft persistence live — 2026-10-26
- PR #143 deployed via Netcup as 44bb4eca7b213818da77448fe58e3a42a9348037. Public entry: /shop/seller-cloud.html; existing /shop/seller.html retains local drafts and adds explicit account load/save.
- /api/v1/shop/seller/offers is company-scoped, active owner/admin only. Expected revisions, company locks, durable request/digest receipts, reversible archive/restore, bounded search/pagination and historical reads are implemented. No public product publication, seller verification, fulfilment, settlement or payment activation.
- Startup hooks were added to freshly fetched current-main start.js. SHOP_SELLER_DRAFTS_ENABLED=false disables this runtime; AI remains excluded. Keep unknown replies explicit and replay identical commands, never silently create replacement records.
- Shared offer-policy.js validates browser/server data. Local drafts are never bulk-uploaded automatically. Private account forms pause while hidden/offline, require fresh access before continuing and clear on account change. Session fingerprints, not credentials, bind recovery references.
- Limits: 200 drafts including archive, 10,000 acknowledged changes per company, 25 rows per page, latest 20 history references, 16 KiB bodies, 15-second total body deadline. Issued invoice history and financial records are unrelated and unchanged.
- 513 shop tests passed; actual startup with disposable PostgreSQL verified parallel identical replay, competing revision writes, tenant separation, archive/restore and native browser current/historical reads. No production fixtures or financial writes were used for release review. Additional WebKit engine installation was still pending when the validated seller release was merged; do not claim that engine passed without reading its final run.
- See docs/shop-seller-persistence-ten.md. Preserve unrelated unpublished purchase-completion work separately; do not restore reconstruction startup files over main.

## Marketplace assistant released 2026-10-26

- User requested support for customer/seller account setup, creating/improving offers and purchase guidance. Approved green/gold marketplace design is preserved.
- PR #144, app deployment commit 2c56cd2b0311a8c6254a621fff7d2a876386b469. Netcup run 40307730352/job 121520911407 succeeded and retained previous container/database backup.
- Live page: https://bringness.de/shop/assistant.html. Contextual Assistent links on marketplace/account/registration/seller/help/hub pages. Guided account, offer and purchase help is live.
- Live GET /api/v1/shop/assistant/status verified HTTP 200 with available:false, mode:guided. Free-form AI is NOT active. Do not describe guided templates as AI answers. Protected server configuration needs a valid SHOP_ASSISTANT_API_KEY + SHOP_ASSISTANT_MODEL (or OPENAI_API_KEY + OPENAI_MODEL). Never request secrets in chat or expose them in the browser/repo/logs. No provider key/model was created or real provider call made in this release.
- server/shop-assistant.js uses fixed OpenAI Responses API, store:false, explicit consent, schema/length checks, no account access/tools, two concurrent requests, twenty process admissions/minute, durable global hundred attempts/UTC day. Only budget counts persist. Optional constructor/migration failures leave existing shop functioning.
- Offer proposals require explicit transfer and apply; confirmation replaces nonempty title/description. Price/tax/stock/account binding remain intact; no automatic save, publication or purchase. Public selling/payments remain unavailable. AI output still requires human review.
- Head 96f12648970ba02c126c789d91ca1f985402b5d5 passed all six PR workflows. 521 shop tests passed; actual entrypoint PostgreSQL/native Chromium verifies guided status and proposal transfer preserving price/stock, account drafts and history. Live browser display checked. See docs/shop-assistant.md.
- Keep local reconstructed server/start.js out of production; this release applies additive hooks to main. Local workbench commit cf99fe3 preserves new module/UI work, prepared main startup/native files are under market-source.

## Shop checkout navigation and assistant ten-block release 2026-10-26

- User screenshot 305(1) reported footer Kasse öffnen incorrectly linking to /pos/. PR #145 replaces it with Zur Kasse opening the existing cart inside /shop/. Generic shop account/history/payment-return links now use /shop/account.html; the explicitly named licence Online-Kasse link still opens the licensed POS intentionally.
- Ten changes documented in docs/shop-navigation-assistant-ten.md: footer cart, account links, payment-return account links, same-page selection history, assistant topic history, example questions without sending, explicit availability refresh, offline/copy handling, full proposal preview, private console configuration helper.
- App commit 73ce9ba0f2e766cb45481e3c64a65e9417badd85 deployed successfully via Netcup run 40310707008/job 121530886843. Prior container and database backup retained. Live browser clicked footer and saw Dein Warenkorb while URL remained https://bringness.de/shop/.
- 524 shop tests and real entrypoint PostgreSQL/Chromium acceptance passed on acd3163ff2377c2c0cdd250f697c70fa6a160bc5. All four applicable PR workflows passed. No real provider calls or production fixtures.
- AI is still awaiting manual protected configuration. Existing forced SSH command accepts only status/backup/restart/deploy; do not claim it can edit secrets and do not weaken this restriction. ops/configure-shop-assistant.py is an explicitly invoked root-console helper, not a public API. It reads the key without echo or arguments, writes only the three SHOP_ASSISTANT settings to the existing /opt/bringness-pos/config/app.env, preserves unrelated values and makes a private backup. It refuses shared/symlink/hardlink/insecure files and suppresses secret-bearing diagnostics. Tests use temporary synthetic configuration only.
- docs/shop-assistant-setup.md includes a pinned download command and console instructions. User must enter key directly on Netcup; never ask for it in chat/screenshots/GitHub source. After user reports Geschützt gespeichert, use existing deploy/pos workflow (restart alone does not reload Docker env-file), then check status and a user-authorized nonprivate test question. Example supported model is gpt-5.4-mini if available for the user's project; no model/access/credit availability was verified.
- Local workbench commits 1fc8581/fa08040/24e46ef preserve work. Keep unpublished purchase reconstruction separate; download-review.html on main was patched additively rather than overwritten from local reconstruction.

## Seller workspace ten-block released 2026-10-26

- User explicitly postponed AI key configuration. Do not resume key setup or request any secret until the owner asks. Current task continued marketplace improvements.
- PR #146 merged as 4e463024cb71d0d820e3d1e63e4f1a08af3c5702. Netcup run 40315296327/job 121546253175 succeeded; previous container and database backup retained. Live page https://bringness.de/shop/seller.html checked in browser with blank category prompt, new goods/digital/service starts, stock filter, preparation summary, character counters and export/print controls. No production draft or login fixture created.
- Ten changes are documented in docs/shop-offer-workspace-ten.md: quick-starts, normalized full-text/EAN local search, stock filtering, descending price sort, preparation checklist, character counters, single current-form export, draft-only print/in-flight unload guard, richer account metadata/date history, seller help and registration correction.
- New offers require explicit category selection, instead of silently defaulting to Software. Quick-starts preserve the existing dirty-form confirmation and leave prices and product facts empty. Existing account drafts retain their category when loaded.
- Local export is import-compatible JSON and never saves or uploads; it validates current form values and preserves unsaved status. Printed preview is a draft, not an invoice/receipt. Price, tax, stock, contracts, backend permissions and publication state were not changed.
- Account list shows stored net/gross amounts, kind, stock, SKU and selectable identity. Dated version history is lazy, toggleable and formatted Europe/Berlin; invalid date responses are rejected.
- Final head 60407f9d677f18ec5058694209f4710f23173bc9 passed 529 shop tests and actual entrypoint PostgreSQL/Chromium acceptance including downloaded JSON, print CSS isolation and service quick-start. Final shop run 40314919699/job 121544992652. One earlier runner stalled in browser setup; a fresh run passed. Browser preparation now has a four-minute deadline, without skipping acceptance. The additional isolated-preview workflow was still running at final deploy check; do not claim it passed without checking its final status.
- Workbench commits 702c5d5, 82f1ae7 and 7f8c82a preserve the app changes locally; GitHub branch has final app plus CI deadline. Keep reconstructed unpublished startup/purchase work separate from main.

## Account draft filters/export ten-block released 2026-10-26

- PR #147 merged/deployed app 08ff5663166f7b8471aff63c38456c1792af224f. Netcup run 40321604259/job 121567648837 succeeded; previous container and database backup retained. Live https://bringness.de/shop/seller-cloud.html checked signed-out with new search/filter/export controls; no production fixture/account was created or entered.
- Server list now searches unordered words across title, category, SKU, EAN/GTIN, description, delivery and fulfilment; adds category-with-children, kind and physical stock filters. GET parameters q/state/cursor remain, optional category/kind/stock added. Strict duplicate/unknown parameter rejection, 120 chars/15 words, all SQL values parameterized, existing owner/admin tenant transaction and statement limits preserved. No schema/financial changes.
- Response adds total and canonical filters from the same repeatable-read transaction; list is still ID-ordered, max 25 rows. Client checks scope, records and current credential fingerprint before accepting results, and applies all filters to later pages. Counts describe the last query; this is not an immutable cross-request snapshot.
- Page supports reset without automatic requests, explicit paging, local grid/list view, and JSON backup of already loaded results only. User can select sections up to 25 for local editing. Existing import limits remain 50 local rows and 600 KB/file; larger whole-result exports are file backups, not automatically restorable into a full local editor. No extra page fetching or account save/publish happens on export. Credentials/company IDs/session fingerprints are excluded from files.
- Operation/epoch guards prevent late requests from restoring data or changing busy state after privacy changes. Export/history/archive require the loaded browser identity. Unknown write replies still use existing identical-command recovery. Help explains scope and limits. See docs/shop-cloud-filters-ten.md.
- Final feature head ce1ad73b344b34a625a3de5bdc1e4bac40860f99 passed 535 tests and actual-entrypoint PostgreSQL/Chromium including combined EAN/category/kind/stock search and downloaded JSON. Shop run 40321107625/job 121565965001 passed. Other main PR checks passed except the separate isolated-preview workflow was still running at release check; do not claim it passed without reading the final state. No physical scanner hardware was tested.
- Workbench commits 76675ae and 151788a preserve source changes; the actual main native acceptance file was patched separately. Do not overwrite main startup/purchase files from the reconstruction. AI key setup remains explicitly postponed by the owner.

## Reviewed offer import ten-block released 2026-10-26

- User continued with the next ten blocks; AI key setup remains postponed. PR #148 deployed app e2261aa8421e3d2d165643d79dece166797e1139 via Netcup run 40324513611/job 121577643779, success with previous container and database backup retained. Live https://bringness.de/shop/seller.html verified with the 4 MB/200-source-row text and initialized hidden .offer-import-panel. No production offer or account fixture was created.
- File selection now opens a local preview, never immediate import. Each source row is independently validated. Invalid rows stay disabled, source company/request/record identifiers are stripped, and every selected imported copy gets a fresh ID. Existing local drafts and open/unsaved editor values remain unchanged.
- Supports source files up to 4,000,000 UTF-8 bytes and 200 entries. Local capacity remains 50. Search, valid/invalid/duplicate filters, per-row detail and checkboxes, select-visible-with-capacity, summary/free places and explicit confirmation are available. Duplicate SKU/title hints never auto-merge or delete records.
- Selection survives storage failure/cancelled confirmation. Clearing/hidden/pagehide/account privacy discards preview and late file reads are ignored. Keyboard focus survives checkbox rendering. New selection is considered by the unload warning. The local save helper now rejects >600,000 serialized characters and duplicate/invalid IDs before setItem, protecting the existing load bound. No account writes, publication, backend migration, AI calls or financial changes.
- Help and cloud-backup text now describe 4 MB/200 preview rows rather than the superseded 600 KB/file limit. The existing local serialized-store bound is characters, not file bytes. Prior release notes with 600 KB import limits are historical; current import uses selection and the new bounds.
- Final head c6b523499ac59c70c85f6d77242aa66072dfe848 passed all four applicable PR workflows. Shop run 40323946493/job 121575671082 passed 540 tests and actual-entrypoint PostgreSQL/Chromium, including mixed-file upload, only-valid-row selection, fresh local identity and preserved unsaved form. Tests used disposable data only. See docs/shop-import-assistant-ten.md.
- Workbench commits cee9000 and bfe9b1c preserve source; native acceptance was patched separately from current main. Keep reconstructed unpublished startup/purchase files separate.

## Independent green discovery design released 2026-10-26

- Owner explicitly rejected the Amazon-like marketplace styling and supplied Screenshot (308)(1).png showing CHECK24. This supersedes earlier Amazon-layout preferences. Approved direction is an independent Bringness interpretation of the rounded portal/cards and soft gradient, kept green. Do not restore the old gold-cart/smile-arrow header by default.
- PR #149/app 0a5d028f4d7703614476863fc596e27da0fc9839 deployed successfully through Netcup run 40327532229/job 121588007779, with prior container/database backup retained. Live https://bringness.de/shop/ visually checked in browser.
- Homepage: emerald-to-white background gradient; rounded white search and translucent navigation pills; independent green asymmetrical discovery deck with existing illustrative category imagery; account entry strip; smaller line icons for account, activities and cart. No fake promotions, inventory, prices or availability were added.
- The old curved smile arrow was replaced across marketplace headers/footers by a diagonal rising arrow in a small rounded outline. Brand identity and CSS version references were updated from exact current-main HTML, preserving all app flows. Account-area header gets a restrained green gradient. POS/waiter and the independent AI app remain unchanged.
- Final feature 90e7b9ef4635e971c30dc6c2612ddb24bedc2c56 passed all four applicable PR workflows, 540 shop tests and actual-entrypoint PostgreSQL/Chromium. Screenshots at 1600/1280/768/390 were visually reviewed; no horizontal page overflow. Public screenshots are short-lived CI artifacts only and captured before any authentication. Shop run 40326750324/job 121585320663; artifact 12652080677. No production login, fixture data or external provider calls used.
- See docs/shop-green-portal.md. Workbench commit e6f3d2d preserves app styling/identity. Native screenshots/workflow were patched from main separately; do not restore reconstructed startup/purchase files over main. AI key configuration stays postponed until requested.


## 2026-10-26 compact flexible marketplace image panels
Owner Screenshot (309): smaller discovery deck, optional four-way lead tile, three-way lower tile, and horizontal right-side image browsing. PR #150 merged as 07d5ff455c72ff9052195e0c42fa8ccb9120efda; Netcup operations run 40332213206/job 121604270528 succeeded and logs confirm this exact deployment, previous container and database backup retained. Final feature head 7c9f9379998f33b81f84a4f15981ca06cbeb90ea; Shop CI run 40331351398/job 121601280033 passed 543 tests plus native entrypoint/PostgreSQL/browser acceptance. Public live homepage verified after deployment, including 1/4 and 1/3 controls. Desktop deck 430px; six source-registry category cards support arrows, touch scroll and keyboard. Layout choice is current-tab session preference only, not a global advertisement editor. Green styling retained; illustrative images and no financial or publication behavior changes. Local commits 76c8be7 and 8f64df8. AI key configuration remains postponed by owner. Isolated AI preview workflow was pending at merge; do not infer its outcome from Shop CI.


## Theme carousel orientation released 2026-10-26
Owner continued marketplace work after compact image panels. PR #151 deployed app 29e4cce6d6e6da8ad89cb81fcfaed876f490f0e6 through Netcup run 40335271072/job 121615028713, success with previous container and database backup retained. Final feature head 33f0106d391c87b1e6479f42033b8cc468f7b4f2 passed 544 shop tests and native PostgreSQL/browser acceptance (run 40334688019/job 121612992099). Public 390/1280 screenshots reviewed. Direct numbered topic selection updates visible range (e.g. 1–2 von 6), visible-card pressed states, and keyboard focus reveals offscreen cards while preserving page position. Source registry remains six cards, green compact design and 1/4 plus 1/3 layouts preserved. Live homepage browser selected topic6 and confirmed 5–6 von 6 and disabled next arrow. No production login/fixture or financial changes. Separate isolated AI preview workflow was pending at release review; no claim of its success. Local source commit 1ae7d22. AI key setup remains postponed.


## Category discovery ten-block released 2026-10-26
Owner requested next ten marketplace blocks. PR #152/app 69eb2256a1bf8317ef04e10191f9fa6087e824b5 adds the ten units documented in docs/shop-category-discovery-ten.md: German search normalization, bounded familiar-word aliases, root-department filter, visible category counts, query-only clear, empty-state full reset, ArrowDown/Enter/Escape shortcuts, selected directory state, hierarchy path and sibling/child shortcuts. All taxonomy/stock/prices and green compact image layouts preserved. Directory input has max100 query matching, uses textContent and known taxonomy only; no extra network, account data or AI calls. Category selection preserves existing browse URL/history and follows keyboard focus into result navigation, honoring reduced motion. Final feature aba34a7cc55032306d3466e0e0f2cd3bc5a2c339 passed all four PR workflows, 547 shop tests and actual PostgreSQL/native Chromium acceptance in run 40337290740/job 121622170080. Native tests cover aliases, root filter, empty recovery, Back history and no horizontal overflow at 1280/390; screenshots reviewed. Local commits 473ca7b/35ebf0f. AI key setup remains explicitly postponed; reconstructed startup/purchase work kept separate.

Netcup run 40338030582/job 121624758977 succeeded; deployment logs confirm exact app commit 69eb2256a1bf8317ef04e10191f9fa6087e824b5, prior container and database backup retained. Live browser verified Laptop returns one Computer & Zubehör category, Enter selects it, URL/category path and current-directory state synchronize and focus follows the selected category. No production fixtures or credentials used.


## Nonblocking cart ten-block 2026-10-26
Owner Screenshot (310).png showed cart modal blocking shopping and explicitly requested right-side placement plus next ten blocks. PR #153 replaces only the cart's showModal with a non-modal show surface, no backdrop/inertness/Tab trap. Desktop >=1100 reserves 384px for fixed right cart; narrower screens use bottom panel capped52dvh plus page-bottom room. Responsive page/card/header adjustments, minimize/expand, independently scrolling content with visible header/actions, Escape (only without another modal), toggle/aria-expanded header entry, live add/count/totals without duplicate feedback, assistant relocation and scroll-preserving close. Ten units in docs/shop-cart-dock-ten.md. Explicit review stays modal and closes the cart, returning to cart on Back; financial/quantity/tax/account gates and browser selection remain intact. No additional backend requests. Source commits2a46f3b/7ce98df/13703af. Keep AI keys postponed and reconstructed unpublished startup/purchase work separate.

Final feature 7be51908c30e09043d2c56e49142acf458c5fbd6 passed all four PR workflows and 550 shop tests plus native PostgreSQL/Chromium in run 40340205740/job 121632552145. Native tests cover actual background search/add, :modal false, live count, minimize, help geometry, Escape and page overflow at 1600/1280/1100/768/390. Public CI screenshots reviewed. App 2b3164f9944f30f30e335c9d3fa6420c99858cee deployed successfully through Netcup run 40340925938/job 121635089354; logs confirmed exact app revision, previous container/database backup retained. Live browser verified empty right dock, editable Windows search with cart still open, minimize/expand and unobscured page; no production account or financial fixture created.


## Saved selection and comparison ten-block 2026-10-26
Owner requested next ten marketplace blocks. PR #154 implements docs/shop-selection-tools-ten.md: local wishlist text search, billing filter, saved/name/period-separated price ordering, visible count/reset/empty state, net/gross/billing metadata, existing-cart disabled state without quantity increment, wishlist comparison toggles, last-removal undo preserving order, comparison equal-fact hiding and category row, and comparison remember/cart transfer. Focus follows rerendered row actions; comparison retains all facts when only one product remains. Unknown-price products never receive cart transfer. Session-only product IDs and existing financial/licence gates preserved; no account writes or new backend requests. User green design and cart dock unchanged. Local commits 7b5e355 and 710e5ab. Initial CI found pre-existing seller-workspace-cloud.test.mjs 15ms sleep flakiness; test now waits up to5s for rendered input/history expansion, preserving all assertions, and passed locally. No seller app behavior was changed. AI key setup remains postponed; reconstructed startup/purchase work kept separate.

Mobile comparison QA widened the fact-label column and exposed a labeled keyboard-focusable horizontal scroll region (local f393116). The original browser setup retry was due to a4-minute dependency-install timeout, not app failure; full browser coverage was retained.

Repeated apt dependency setup timeouts were resolved by using the runner's installed google-chrome when command -v confirms it; otherwise the original pinned Chromium install remains. Native acceptance launches the chrome channel only with SHOP_BROWSER_CHANNEL=chrome. No acceptance was skipped or security/network settings weakened. Final CI logged Google Chrome155.0.8059.39 and passed all four PR workflows, 554 tests and native acceptance for head 5bd51c3eb099c95343ffed5984d10c1587acf6b3 in run 40348051202/job 121660419009. Public screenshots before login were reviewed including final readable mobile comparison; artifact12662612121. App merge a9b83b3fb3f1bcb3cecbe64028f5fe82ba7c6785.

Netcup run 40348764364/job 121662757623 succeeded; logs confirmed app a9b83b3fb3f1bcb3cecbe64028f5fe82ba7c6785, previous container and database backup retained. Live homepage verified wishlist search/reset, empty result, removal and undo. Temporary browser selection was removed and original empty wishlist/cart/comparison restored; no production account or server fixture was created.


## Compact camera/code search 2026-10-26
Owner voice instructions approved a tiny camera icon beside search, mobile capture or gallery preview, QR/EAN recognition from the same image, with AI connection explicitly postponed until the end. PR #155 adds visual-search.js/css and dialog, local photo preparation and native BarcodeDetector adapter (QR, EAN8/13, UPCA, ITF when supported), plus manual public-product code lookup. No getUserMedia stream, uploads, AI calls, WebStorage photo data, automatic navigation/cart/financial action or third-party decoder/CDN. JPEG/PNG/WebP max8MB, max32MP, detection copy capped1600px; finite deadlines, generation guard and URL/canvas release on close/remove/hide/pagehide. Actual native dialog close event is asynchronous; acceptance waits for actual src removal. GTIN checksums/leading zeros, known public id/sku, strict own product links only; foreign/auth/token URLs are rejected without echo/open. Current three public Bringness products have no GTIN assignment; unknown valid EAN honestly reports no assigned public item. Does not search private seller drafts. AI photo object recognition remains inactive. Local source commit a943be2; actual main native acceptance patched separately, preserving installed-Chrome CI. docs/shop-camera-search.md covers scope/limits. Physical phone camera capture still requires owner device testing; native desktop screenshot correctly showed unsupported detector with manual fallback, not an AI or universal scanner claim.

Final head 81651648888e13b5f03742eef338cf7cf8b1050d passed all four PR workflows, 559 tests and actual PostgreSQL/native Chrome acceptance in run 40358518084/job 121697356118. Public screenshot artifact12667396982 reviewed at desktop/mobile, tiny camera icon fits search header and local preview/unsupported fallback are honest. Native desktop has no BarcodeDetector, so adapter tests plus manual fallback were checked, not a claim of a physical phone scan. App merge df816cecc5b4b4845751f61ae44bfe78374d320c.

Netcup run 40359365800/job 121700327233 succeeded; exact app revision df816cecc5b4b4845751f61ae44bfe78374d320c confirmed, prior container/database backup retained. Live browser checked camera button, dialog, known code pos-online and explicit product result; closing clears input, cart/saved/compare remained empty. New agent public tab1 retained for user; no production photo upload or account fixture. Camera/photo capture itself still needs physical owner-phone verification.


## Stable ad numbers and discreet sharing released 2026-10-26
Owner approved fixed searchable ad numbers for existing/new advertisements and a very subtle share icon, then requested the next ten blocks. PR #156/app 95186d0956416bff6d78f63647a0f29f504716e5 deployed successfully via Netcup run 40363154858/job 121713671361; logs confirm exact app revision and previous container/database backup retained. Public live browser verified query 100002 returns only Windows, share reports Link kopiert, and the direct /shop/?ad=100002 link automatically opens Windows with the same number. No production account, offer, cart or financial fixture was created.

Ten units are documented in docs/shop-listing-sharing-ten.md. Built-in public offers use fixed 100001/100002/100003 (reserved built-in range below 1000000). Database-owned globally unique shop_seller_offers.listing_number identity starts at1000001, backfills existing account drafts, and persists across edits/archive/restore/history/replays including old stored replies. Identity plus trigger reject changes; gaps are legitimate. Local-only copies have no global number until saved. Private merchant drafts stay private and cannot be opened publicly by number; a future publication implementation must retain their assigned identity and enforce separate approval. No seller publishing was enabled.

Public exact number lookup ignores browsing filters, ordinary text search preserves them. Small gray-green 16px share icon/32px control in cards/details opens native share sheet or copies only a clean public ad URL, with selected read-only manual fallback. Cancellation never copies; no claim of recipient delivery. Old product links work; unknown/duplicate ad links show an unavailable notice. Camera/code lookup accepts public ad numbers/links. No AI keys, provider calls, financial or POS/waiter changes.

Remote feature head f4e72ceff5bc66da70509e1acb387ec2e89599b4 (app27572ec, testsf4e72ce) passed all five applicable PR workflows, 567 isolated Shop tests and native actual-entrypoint PostgreSQL/Chrome acceptance, run40362438668/job121711148228. Public mobile/desktop share screenshots artifact12668666846 were reviewed, including clipboard-denied manual selection. Local source checkpoints3384d54/2bbf4f4 have identical final tree94a479698bb1f2df8825208e0acb44904dc93a8e. Real handset app sharing/WhatsApp delivery was not performed. Git CLI had no credential helper; publication succeeded through the verified owner-connected GitHub connector. AI connection stays postponed.


## Approved twenty-point discovery/preparation scope — 2026-10-26
- Owner explicitly approved the twenty listed areas before work. Several proposed items already existed; preserve them and never call this twenty newly completed production systems. See docs/shop-discovery-twenty.md for the exact existing/new/partial matrix and remaining work.
- PR #157/app 0a1a8f71a38f627e12cebc07a46665f5bdccac2f deployed through Netcup run40375766635/job121758280968; logs confirm exact revision and retained prior container/database backup. Live browser verified net minimum35 returns Windows only, typo Windwos returns Windows, and product details expose explicit contact/report mailto drafts with clean ad100002 link. No mail, production account/offer/order/payment fixture or location permission was submitted.
- New bounded query suggestions and one-edit text fallback never approximate numeric ad identities. Inclusive net price/city filters roundtrip in public URL/history; opt-in radius coordinates stay ephemeral, have a late-result guard and never enter links/storage. Current products have no pickup coordinates or publication dates: no invented nearby/newest claims. Exact ad-number lookup still bypasses ordinary browsing filters.
- Existing favorites/recent/compare/category/preview/copy behaviors preserved. Current first-party provider section links existing public Bringness offers and imprint. Contact/report use explicit email drafts, not an internal messaging/moderation system. Similar public offers supplement existing alternative-base comparison. Gallery component allows up to8 dedicated local product-image paths with selection/zoom, but current products have no assigned product photos; actual upload/assignment remains open.
- Optional validated workflow paused/sold is a PRIVATE draft preparation note only. It persists via existing local/cloud payloads, resets on duplicate and returns to default by selecting In Bearbeitung. No public seller publication/deactivation, booked sale, inventory or financial mutation. Absent/default workflow preserves legacy canonical payload/digest and pending-command replays. Public verified third-party profiles/publication, actual image/location metadata, internal messaging and server moderation remain unfinished; do not advertise them as complete.
- Final feature a6ff8ad1d0a6dedf0c6ecd42b372f991620f9454 passed all four applicable PR workflows, 578 isolated Shop tests and actual-entrypoint PostgreSQL/Chrome acceptance (run40375101091/job121755889214). Desktop/mobile discovery screenshots from same app-tree predecessor reviewed (artifact12674387802); final difference adds tests only. Local source commits5bbf5e4/bc006ac have final tree f4a54221a73a6de9900c11a46da10f0dcf6b9949. Physical geolocation, real product-image delivery and real outgoing email were not tested. AI configuration remains explicitly postponed; preserve POS/waiter and payment gates.


## Next twenty personal Shop tools released — 2026-10-26
- Owner requested deferring and collecting the unfinished preceding public-seller/gallery/message/location work, then proceeding with the newly proposed twenty points without repeating them. Those deferred tasks remain in docs/shop-discovery-twenty.md; do not reactivate them or AI without a later instruction.
- PR #158/app cb99353d39b790054a65d852f06c317474cf769f deployed successfully through Netcup run40385590467/job121792891505. Logs confirm exact revision and retained previous container/database backup. Public live browser verified direct ad100001 print/QR controls, QR link to the same immutable number, shared comparison for100001/100002, personal search tools and unchanged empty favorites/comparison/cart. No production account, offer, mail, order or financial fixture was created.
- Scope and existing/new matrix: docs/shop-personal-twenty.md. Four items (grid/list, company title/number search, archive restore, unsaved-editor guard) were retained, not twenty newly invented production systems. New session tools include saved searches/history, named favorite lists/private notes, unavailable references, hidden results with exact-number bypass, public number-only list/comparison links,12-at-a-time loading, product print/QR, loaded-result private workflow filter, sequential own-draft batch archive and CSV exports. Remembered sanitized public filters/view use localStorage; coordinates and credentials never enter links/storage preferences. Explicit incoming URLs take priority.
- Private notes/list names are never shared; selection recipients view public IDs without changing their own favorites/cart. Default and named favorites retain retired IDs as unavailable. Storage failure preserves saved state, reports inside the open dialog, and subsequent list edits recover after storage is writable. CSV quotes multiline fields and neutralizes spreadsheet formulas. Exports include only saved local or explicitly loaded own rows, not unrequested pages.
- Batch archive is explicitly sequential/non-atomic: user selection/confirmation, per-row fresh account check, existing expected revision/durable request receipt, stop at first uncertainty, retain pending identity for explicit identical retry. Confirmed rows are removed from loaded export scope; archived rows cannot be selected as active. No public publication/deactivation/sale or payment mutation.
- Final head abfea1b21c02cf5d083f71df9fd69429bb04536e passed all four PR workflows,590 isolated Shop checks and actual-entrypoint PostgreSQL/Chrome mobile/desktop acceptance in run40385037334/job121790951830. Tests cover incoming selection privacy, unavailable favorites, preferences, back-scroll, QR matrix parity, print, storage recovery and partial batch outcomes. Public 1280/390 screenshots reviewed from same normal-view predecessor dc8c758, artifact12680085055; later UI changes concern failed-storage feedback/recovery. Physical handset QR scanning and recipient app delivery remain device acceptance.
- Isolated POS/AI preview run40385037371 passed full runtime/browser/network-fence/encrypted-backup/restore. Browser preparation now reuses installed Chrome (logged155.0.8059.39), matching Shop CI, with a four-minute fallback installer deadline. No tests skipped, network isolation weakened or provider/AI settings changed. Local source checkpoints97b9e6e,63299e4,7b92506,ecf7d50,8228336,5e66bd1,c41ef5f have final tree687e128118abf5bf77bcd09d5a7edd163ab92ba6, identical to remote feature tree.

## Customer marketplace stability block — 2026-10-27
- Owner approved twenty customer-side areas (search/categories/filters/prices/navigation/details/cart/storage/responsive journey), with SSH/IDrive postponed. Work continues from main 54b33f9; do not restore reconstruction startup files.
- See docs/shop-customer-stability-twenty.md for exact existing/new/deferred mapping. Fixes cover catalog text truncation, visible-result detail pagination, gallery load/error lifecycle, pending cart quantity edits and non-destructive initial cart reads. Preserve green layout, private seller boundaries, prices/payment gates and postponed AI configuration.
- Invalid quantity input stays memory-only across rerenders/reopen; committed quantities keep session persistence. Invalid edits block review, valid pending edits commit before review totals. Initial load reports corrupt/unreadable storage without overwriting it; explicit later cart changes can replace corrupt data.
- No completed payment, seller stock/variant shipping, actual assigned product photos, device acceptance or deployment is implied. Native browser regressions are wired into the existing disposable PostgreSQL/Chrome CI; local browser download failed. Record actual final checks separately.

- Final feature a59bb5a0710274857dd66691c14278b6e379287f in PR #161 passed all four applicable workflows. Shop run40530120598/job122280309100 passed597 tests (zero failures/skips) plus native actual-entrypoint PostgreSQL/Chrome acceptance. Screenshots artifact12746086322 at390/768/1280 were reviewed. Local f852ae54/d2e19f60 have identical source tree3afe49302a12093d5f25ae784bb2c69e3137bf21. Subsequent verification-record commit is documentation only. No merge/deployment has been performed for this block.

## Seller recovery continuation — 2026-10-27
- Owner requested continuing autonomously in twenty-point blocks. Branch fix/shop-seller-recovery-20261027 builds on the unmerged customer stability branch; scope/evidence are in docs/shop-seller-recovery-twenty.md. Preserve the earlier fixes and do not deploy an unverified stack.
- Local draft persistence rejects duplicate/case-equivalent and malformed UUID identities before mutation. Seller reads bind the exact requested ID/source revision, validate source bounds and reject inconsistent history.
- A confirmed retry keeps newer form edits and the confirmed ID, but blocks another account save until explicit successful account reload. Export remains available; cancelling reload retains edits. Never advance the editor revision solely from a recovered receipt or silently create a new ID after a lost first-save reply. Account changes reset this gate; ordinary local saves do not.
- Pending-request UI ignores replies from stale editor/operation epochs. Native lost-response regression uses disposable PostgreSQL accounts at 390/768/1280. Record returned results before claiming acceptance. Public merchant publication/stock/variants/shipping, AI configuration and IDrive are not implemented by this package.

- Final application/test head f09e829cad26ce570d7c63ad1a8ca0553084903a in stacked PR #162 passed both applicable workflows: Shop run40541321287/job122320151656 (610 tests, zero failures/skips, plus PostgreSQL/Chrome recovery acceptance at390/768/1280) and isolated POS/AI run40541321324 (runtime/browser/network fence/encrypted backup+restore). Local tree a5f72646e0b9eeffdf81994255550df9e340a470 matches. Canonical-Origin browser requests are forwarded exclusively to loopback fixtures; production origin policy was preserved. No merge/deployment. Later verification changes are documentation only.

## Public merchant merchandise and order handoff — 2026-10-27
- Owner explicitly authorized connecting merchant drafts to the customer side, publication/edit/withdrawal, actual variant quantities, shipping/pickup and server-side cart revalidation through order handoff. This supersedes the earlier deferral for these specific areas. AI, storage purchase and unrelated POS/waiter design remain unchanged.
- New independent runtime is opt-in with SHOP_MARKETPLACE_ENABLED=true, excluded from AI and disabled by default. It uses new shop_market_* tables, never restores reconstructed seller/startup files. See docs/shop-public-marketplace-twenty.md for all twenty connected areas and exact limits.
- An active owner/admin session plus explicitly approved shop_market_sellers business is required to publish. No automatic seller approval or new provider/payment activation. Public business profile must be verified by an authorized administrator before provisioning; no production seller has been provisioned by this work.
- Published physical merchandise is a separate validated snapshot of a current private draft, retaining its immutable ad number. Archive withdraws atomically; restore/private editing never silently publishes. Explicit variant stock, taxes and shipping/pickup are validated again at quote and handoff.
- Authenticated unpaid order handoff deducts available quantities and saves an immutable merchant order atomically, with account-bound receipt/recovery. It does not create payments, receipts, licences or fiscal sales. Acceptance/rejection/cancellation, shipment execution, release of held quantities and real payment settlement remain separate work; never call this a complete paid marketplace.
- Local full suite passed620 before five client checks were added; final focused service/client checks passed15. Native Chromium against disposable PGlite passed publication/lost-reply replay/stock/inbox/withdrawal at390/768/1280. PostgreSQL actual-entrypoint and concurrent last-piece coverage are wired into CI; record actual results separately. No merge/deployment.

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

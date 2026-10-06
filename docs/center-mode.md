# Center mode — integration draft

Current integration: PR #61, branch `feat/center-ai-integration`. This is a draft; main and production have not been updated. Online ordering and automatic TSE signing remain disabled.

## Payment ownership

Food payments go directly to the selected restaurant operator. Each restaurant connects its own Mollie merchant account during onboarding. Bringness POS license/subscription credentials must never receive restaurant food payments. The server chooses the merchant from the restaurant, not from guest-supplied bank or account data. Other providers can be added through the provider interface when needed; unsupported providers cannot enable online checkout.

## Implemented

- Centers, fixed shared table tokens and restaurant membership. QR/NFC use the same guest URL: `/center/index.html?code=TABLE_TOKEN`.
- Scoped management and one-center-per-restaurant constraint. Enrollment currently supports restaurants belonging to the acting company.
- Platform-admin approval delegates initial table setup to the first enrolled restaurant. Completion locks delegated table creation. Platform maintenance access remains.
- Mollie authorization callback, browser-bound one-use state, encrypted credentials, token refresh and merchant/profile readiness checks.
- Server-priced guest cart, availability checks at menu load and order creation, durable request IDs, reusable checkout and reconciliation of lost payment responses.
- Provider verification of merchant, amount, currency and order before one-time receipt booking and kitchen release.
- Ingredient reservation at release and consumption at preparation start through the AI inventory bridge. Retries do not intentionally duplicate ledger entries; inventory failures prevent status progression.
- Kitchen ordering by confirmed payment: only the earliest waiting order starts next; started orders can finish independently. The view refreshes automatically and retains existing orders during outages.
- Guest status and milestone history. Connection failures retain the last state and retry; hanging requests time out after 15 seconds.
- Receipt/TSE preparation and guarded automatic signing worker. Ambiguous hardware responses require reconciliation rather than blind signing retries.

## Entry points

- Management: `/center/manage.html`, using existing POS login.
- Kitchen: `/center/kitchen.html?restaurantId=RESTAURANT_ID`, with protected restaurant-scoped access.
- Guest menu: `/center/index.html?code=TABLE_TOKEN`.
- Guest status: `/center/status.html#token=STATUS_TOKEN`.
- Public discovery: `GET /api/v1/guest/center/restaurants` and `GET /api/v1/guest/center/menu`.
- Guest checkout: `POST /api/v1/guest/center/order`; the server rejects checkout unless `CENTER_CHECKOUT_ENABLED=true`. This flag is not rollout authorization and must stay disabled pending production readiness.

## Verified scope

GitHub Center validation run 37535677295 completed successfully on integration commit c9e684f853bd87a70bce41c995fad51c377da62c. It includes the PostgreSQL database flow and Chromium checks for management approval/locking, preserved checkout attempts after uncertain responses, kitchen ordering after an inventory failure, and guest status recovery after a connection outage.

Browser tests intercept API requests. Provider and hardware responses in integration checks are simulated. These results do not demonstrate an actual Mollie payment, physical TSE signing or a complete browser-to-production checkout.

The workflow also tracks AI inventory, POS stock bridge, TSE and server startup dependencies so those changes trigger Center validation.

## Remaining work before production

- Configure platform Mollie Connect application settings and validate a complete payment against a restaurant-owned account; each restaurant grants access itself during onboarding.
- Integrate the real Swissbit SDK/bridge, configure each restaurant's TSE and validate signatures using actual hardware.
- Validate the complete deployed flow across browser, POS, AI inventory, payment provider, receipt and TSE, including recovery paths.
- Implement cross-company restaurant enrollment/invitations.
- Complete the per-scan ordering lifecycle. A static QR/NFC URL alone cannot prove a physical rescan.
- Implement supported, consented notifications when the guest page is closed. The current status page requires the page to remain open.
- Complete shared table QR image export and review the remaining Center requirements.

Do not enable checkout or automatic signing solely because simulated checks pass.

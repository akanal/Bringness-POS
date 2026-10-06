# Center mode — integration draft

Current integration: PR #61, branch `feat/center-ai-integration`. This is a draft; main and production have not been updated. Online ordering and automatic TSE signing remain disabled.

## Payment ownership

Food payments go directly to the selected restaurant operator. Each restaurant connects its own Mollie merchant account during onboarding. Bringness POS license/subscription credentials must never receive restaurant food payments. The server chooses the merchant from the restaurant, not from guest-supplied bank or account data. Other providers can be added through the provider interface when needed; unsupported providers cannot enable online checkout.

## Implemented

- Centers, fixed shared table tokens and restaurant membership. QR/NFC use the same guest URL: `/center/index.html?code=TABLE_TOKEN`.
- Scoped management and one-center-per-restaurant constraint. Restaurants from other companies join through restaurant-bound invitations confirmed by their own owner/admin.
- Platform-admin approval delegates initial table setup to the first enrolled restaurant. Completion locks delegated table creation. Platform maintenance access remains.
- Mollie authorization callback, browser-bound one-use state, encrypted credentials, token refresh and merchant/profile readiness checks.
- Server-priced guest cart, availability checks at menu load and order creation, durable request IDs, reusable checkout and reconciliation of lost payment responses.
- Provider verification of merchant, amount, currency and order before one-time receipt booking and kitchen release.
- Ingredient reservation at release and consumption at preparation start through the AI inventory bridge. Retries do not intentionally duplicate ledger entries; inventory failures prevent status progression.
- Kitchen ordering by confirmed payment: only the earliest waiting order starts next; started orders can finish independently. The view refreshes automatically and retains existing orders during outages.
- Guest status and milestone history. Connection failures retain the last state and retry; hanging requests time out after 15 seconds.
- Receipt/TSE preparation and guarded automatic signing worker. Ambiguous hardware responses require reconciliation rather than blind signing retries.

## Cross-company invitations

A Center owner/admin creates an invitation in management using the target restaurant ID. The link opens `/center/join.html#token=INVITATION_TOKEN`; share it with the restaurant operator. No message is sent automatically. Invitations expire after seven days, are stored as hashes, and are consumed transactionally on acceptance. The accepting owner/admin must belong to the target restaurant's company. Existing one-center-per-restaurant restrictions remain. Joining does not enable checkout or connect a merchant account: each operator retains control of their own Mollie onboarding. Members see their own restaurants; the Center operator sees its membership list. Delegated table setup remains limited to the approved setup user.

## Table QR export

Management includes an authenticated SVG download for each active table, available after delegated setup is locked. The server requires completed setup and authorizes either the Center's company or the specifically approved setup user, including a delegated operator from another company. Other members do not gain QR export rights through membership alone. The export encodes the existing fixed guest token. Configure a root HTTPS public origin using `CENTER_PUBLIC_ORIGIN`, `PUBLIC_BASE_URL` or `PUBLIC_URL`. Request host headers are not used to choose the QR destination. Endpoint: `GET /api/v1/centers/:centerId/tables/:tableId/qr`.

## Entry points

- Management: `/center/manage.html`, using existing POS login.
- Kitchen: `/center/kitchen.html?restaurantId=RESTAURANT_ID`, with protected restaurant-scoped access.
- Guest menu: `/center/index.html?code=TABLE_TOKEN`.
- Guest status: `/center/status.html#token=STATUS_TOKEN`.
- Public discovery: `GET /api/v1/guest/center/restaurants` and `GET /api/v1/guest/center/menu`.
- Guest checkout: `POST /api/v1/guest/center/order`; the server rejects checkout unless `CENTER_CHECKOUT_ENABLED=true`. This flag is not rollout authorization and must stay disabled pending production readiness.

## Checkout reload recovery

Before submitting, the guest page saves the cart and request ID in sessionStorage, keyed to the table token. Reloading the same tab restores the locked cart and retries the existing server-idempotent request. Already released orders and verified failed/canceled/expired payments return a status-page URL instead of reopening the provider checkout. Pending payments continue to reuse their original checkout. No new checkout is sent if storage cannot be written or an existing saved attempt cannot be read. An explicit server response permitting cart editing clears the saved attempt. This recovery is limited to the same browser tab; closing it or clearing browser storage loses this local checkpoint. It does not prove a physical QR rescan or authorize rollout.

## Guest notifications

The status page offers push enrollment only when explicitly enabled and configured. Consent is requested on a button click. An order-specific status token authorizes subscription storage for 24 hours. The ready transition writes an outbox entry in its transaction. A worker claims entries, sends restaurant and receipt-based collection number, removes expired endpoints and bounds retries. Delivery is at least once: a lost acknowledgement can repeat a push, with a stable per-order notification tag. Provider acceptance does not prove device display. Subscriptions expire with status access; no live push delivery has been verified.

## Verified scope

GitHub Center validation run 37541603209 completed successfully on integration commit 4745a148a5084de98edff14662e976c29f1e6fed. PostgreSQL checks also cover cross-company invitation acceptance, replay rejection, restaurant visibility and merchant-account isolation. It includes the PostgreSQL database flow and Chromium checks for management approval/locking, preserved checkout attempts after uncertain responses, kitchen ordering after an inventory failure, and guest status recovery after a connection outage.

Browser tests intercept API requests. Provider and hardware responses in integration checks are simulated. These results do not demonstrate an actual Mollie payment, physical TSE signing or a complete browser-to-production checkout.

The workflow also tracks AI inventory, POS stock bridge, TSE and server startup dependencies so those changes trigger Center validation.

## Remaining work before production

- Configure platform Mollie Connect application settings and validate a complete payment against a restaurant-owned account; each restaurant grants access itself during onboarding.
- Integrate the real Swissbit SDK/bridge, configure each restaurant's TSE and validate signatures using actual hardware.
- Validate the complete deployed flow across browser, POS, AI inventory, payment provider, receipt and TSE, including recovery paths.
- Complete the per-scan ordering lifecycle. A static QR/NFC URL alone cannot prove a physical rescan.
- Validate guest Web Push delivery on real devices, including supported Safari/iOS setup. Consent enrollment, Center-scoped service worker and durable dispatch are implemented; sender responses and browser capabilities were simulated. Enable only after configuring VAPID keys and explicitly setting `CENTER_PUSH_ENABLED=true`.
- Review the remaining Center requirements.

Do not enable checkout or automatic signing solely because simulated checks pass.

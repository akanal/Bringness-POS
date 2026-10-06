# Center mode — first implementation stage

Payment routing decision (2026-10-06): food payments go directly to the selected restaurant operator, never to the center operator or the Bringness POS license account. Each participating restaurant therefore needs its own verified merchant payment connection. Checkout must resolve that connection from the selected restaurant on the server; a guest-supplied merchant account must never select the payee. Payment confirmation must be verified against that same merchant connection before kitchen release.

Requested flow: a shared center table opens participating restaurants via QR or NFC. The guest chooses one restaurant and orders several items in one order. Only provider-confirmed payment releases the order to that restaurant. Staff mark it ready for collection; the guest receives the restaurant name and collection number. Another order requires a new scan, matching the current restaurant/pickup flow. A static link cannot prove physical rescanning.

Implemented here: persistent centers, independent shared tables, active restaurant memberships, owner-scoped management API, center/table restaurant discovery, menu selection at `/center/index.html?code=TABLE_TOKEN`. QR and NFC must encode this same URL. Existing restaurant/pickup routes remain unchanged.

Management endpoints (owner/admin authentication):

- `GET/POST /api/v1/centers`: list owned centers / create with `{name}`.
- `GET/POST /api/v1/centers/:id/tables`: list / create with `{name}`. Returned `qr_token` constructs the guest URL.
- `GET/PUT /api/v1/centers/:id/restaurants`: list / set membership with `{restaurantId, active}`. Only restaurants owned by the current company can be enrolled at this stage.

Public endpoints require the center table token:

- `GET /api/v1/guest/center/restaurants?code=...`
- `GET /api/v1/guest/center/menu?code=...&restaurantId=...&lang=de`
- `POST /api/v1/guest/center/order`: explicitly unavailable (503), never creates unpaid kitchen orders.

Not production-complete. Pending: owner management UI and QR image export, enrollment/invitations for restaurants owned by other companies, merchant payment onboarding for direct restaurant payments, provider callback validation with amount/currency/order verification, idempotent order release and receipts/TSE, per-scan checkout lifecycle, restaurant queue integration, ready button and guest notifications. Existing license/subscription Mollie credentials must not silently receive restaurant food payments. Closed-page notification requires a configured SMS provider or supported, consented web push; neither is claimed ready by this change.

Validation: `node --test server/center-core.test.js server/qr-service.test.js`. Tests cover tenant isolation, guest membership isolation, role checks, malformed tokens and payment fail-closed behavior. A real PostgreSQL migration and paid end-to-end flow still need integration testing before deployment.
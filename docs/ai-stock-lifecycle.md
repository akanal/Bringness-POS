# Bringness AI: reservation and preparation inventory

Implemented rules agreed 2026-10-06:

- Physical initial stock is entered from a count. No physical inventory is invented. New ingredients suggest minimum 1 and target 3 in the selected unit; the owner can change both. Existing ingredients retain their minimum and initially use it as their target.
- Recipe quantities describe one portion. Acceptance atomically reserves ingredients without reducing physical stock. Preparation consumes the saved ingredient snapshot and releases that reservation.
- Cancellation before preparation releases reservations. Cancellation after preparation leaves consumption intact. An explicit owner-authorized return requires a reason and confirmation that the ingredients really remained unused; total returns cannot exceed original consumption.
- Request UUIDs prevent duplicate writes. Account/location/source scoping prevents cross-tenant access. Account-level locking and ordered stock locks protect reservations and mode switches.
- Free stock is physical minus reserved. Recipe availability becomes false when free ingredients do not cover one portion. Ingredient writes latch the sold-out flag; owner release checks current stock. active and stock_blocked are separate.
- Inventory counts, corrections, spoilage, spillage, waste and own use are recorded with actor, reason, time and before/after amounts. They may expose reservations exceeding actual stock; preparation then refuses insufficient physical stock and requires an inventory correction or cancellation.
- Purchasing suggestions use target levels and free quantities, and account separately for confirmed incoming and pending orders. Delivery orders are not physical stock until confirmed receipt. No supplier order is sent without the existing explicit checkout confirmation.

## UI and API

`Küchenverbrauch` provides manual acceptance, preparation, cancellation and justified partial returns. `Lager & Standorte` exposes minimum/target and physical/reserved/free quantities. `Rezepte` shows ordering availability and explicit release. Existing loss forms add spillage and own use.

External restaurant connectors may choose `lifecycle` before their first booking. `POST /api/ai/v1/kitchen-orders` receives accept/start/cancel/return events using the connector's own location; `GET /api/ai/v1/availability` exposes availability. OpenAPI is updated. An API key is a privileged restaurant inventory credential, not a guest credential.

## Production limitations

This change does not deploy itself. Bringness POS now offers an explicit lifecycle mode with durable POS commands. Deploy the POS migration and handler before deploying the AI worker. The kitchen submits acceptance or preparation; the POS status remains unchanged until the AI ledger commits. AI acknowledgements are replayed using the same command UUID after a crash, preventing a second reservation or debit. Domain errors reject the command without advancing the POS; temporary failures remain pending. Both runtimes need the updated revision and the shared POS database connection; the AI runtime also needs its existing dedicated AI database credentials. Unrelated external menus still need the availability and kitchen endpoints.

Sales and lifecycle modes cannot be mixed on one connector or changed after bookings. Manual acceptance is refused while an active sales connector covers that location. Historical orders must not be entered again through another source. Configure a single authoritative stock-booking path per order before production.

Legacy sales/reversal APIs retain their existing behavior for compatibility. The new kitchen lifecycle does not infer unused ingredients from a monetary refund.

Validation: run `node server/ai-tests/stock-lifecycle.mjs` (PGlite and JSDOM in the existing server/ai-tests dependency package), `node --test server/ai-sales-contract.test.js`, and syntax checks. Real external provider/POS event integration and production migration verification remain required. Center work is deferred.

## Bringness POS activation and limits

Keep existing connectors in sales mode. Enable lifecycle only explicitly after mapping all active POS products and finishing every open POS order. A connector that already booked sales cannot change modes: create a fresh POS connection. Only one lifecycle booking source is allowed per AI location. Pausing a POS lifecycle connection requires all open POS orders to be finished or cancelled.

POS kitchen actions are available to owners, administrators, managers and kitchen staff; waiters are restricted to their assigned tables. Acceptance reserves the immutable item snapshot. Accepted items cannot be edited: cancel and create a new order; after preparation, cancellation retains consumption. Linked unused-ingredient returns are available to the restaurant owner in the AI kitchen view with a reason and explicit confirmation. A return does not reopen an order or undo payment.

This first POS bridge applies to the order-first table/QR kitchen workflow. Direct instant paid checkout is blocked while lifecycle is active because it has no acceptance/preparation event. Finish the kitchen flow before collecting payment. Historical paid orders are not reimported. No restaurant payment provider or Center rules change.

AI updates the separate POS stock-availability flag every three seconds; it does not change product activation or seasonal/time rules. Guest menus, service selection and POS product queries exclude unavailable stock. Availability can be stale between polls; the authoritative acceptance transaction checks and reserves actual free stock atomically. A depleted recipe stays blocked until an authorized owner releases it after a stock correction or delivery.

Validation: `node server/ai-tests/stock-lifecycle.mjs` and `node server/ai-tests/pos-stock-bridge.mjs`. The bridge scenarios use two independent PostgreSQL engines, including a crash after the AI commit, a failed POS acknowledgement, replay, shortages, cancellations, returns, tenant isolation, item immutability and temporary access failure. A live linked-account browser test remains required before production activation.

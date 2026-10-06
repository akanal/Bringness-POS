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

This change does not deploy itself. The existing Bringness POS synchronization still imports paid sales only. It cannot infer acceptance and preparation from paid-sale records; POS connectors remain in sales mode. A separate POS event bridge and end-to-end deployment are required for the agreed timing to run automatically in that POS. External menus must integrate the availability endpoint and kitchen acceptance endpoint to enforce sold-out ordering. AI flags alone do not change an unrelated external menu.

Sales and lifecycle modes cannot be mixed on one connector or changed after bookings. Manual acceptance is refused while an active sales connector covers that location. Historical orders must not be entered again through another source. Configure a single authoritative stock-booking path per order before production.

Legacy sales/reversal APIs retain their existing behavior for compatibility. The new kitchen lifecycle does not infer unused ingredients from a monetary refund.

Validation: run `node server/ai-tests/stock-lifecycle.mjs` (PGlite and JSDOM in the existing server/ai-tests dependency package), `node --test server/ai-sales-contract.test.js`, and syntax checks. Real external provider/POS event integration and production migration verification remain required. Center work is deferred.

# Bringness AI platform foundation

## Access

Public page: `/ai.html`; account workspace: `/ai-workspace.html`; platform administration: `/ai-workspace.html?admin=1`.

AI accounts are independent of POS users. Operational AI data uses a separate PostgreSQL database (`AI_DATABASE_NAME`, default `bringness_ai`) and non-superuser role `bringness_ai_app`, with its own `AI_DB_PASSWORD`. No fallback to the POS database is allowed. Both databases currently share the existing Railway PostgreSQL server and persistent volume; a dedicated server/service can be introduced later. Only existing platform-admin authentication queries use the POS pool. Supported roles: restaurant, dealer, wholesaler, manufacturer. Email verification required; salted scrypt password hashes, hashed 12-hour bearer sessions, durable authentication throttling, single-use expiring verification/reset links. Session tokens held in sessionStorage. Existing active platform_admins use their platform credentials for AI administration; ordinary POS owners are not platform administrators.

On startup the database administrator connection creates/validates the dedicated database and role. Existing AI tables are atomically copied under source table locks. The old AI tables become read-only rollback data; POS tables are not copied or changed. AI API returns 503 until setup/migration completes.

SMTP reuses the configured relay, but mail display name is Bringness AI. `AI_PUBLIC_BASE_URL` overrides `PUBLIC_BASE_URL` when a separate AI domain is available. No SMTP secrets are stored in code.

## Workflow

Restaurant creates locations and stock with explicit kg/l/piece units, actual quantity and minimum. Supplier completes address, delivery area/conditions, minimum order value and catalog with pack size, whole-pack minimum and net price. Restaurant searches catalog, maps offer to stock with matching unit and explicitly submits an order. Supplier accepts; restaurant confirms full receipt. Receipt adds snapshot pack quantity times packs to stock and records a ledger move in the same transaction. Repeated receipt does not duplicate stock. Buyer-request UUID prevents duplicate submissions. Parties may cancel sent/accepted orders; cancellation clears commission. An order currently contains one product. Requested dates need supplier acceptance; delivery eligibility is manually checked.

Provision is recorded, not collected: 200 bps of net goods value in introduction. There is no automatic subscription, payment or invoicing. Direct settlement with supplier is provisional and shown in the workspace. Payment-provider model remains open.

## Launch controls

New registrants can set up accounts by default. Order submission defaults to disabled; platform administrator enables it in Betriebsfreigaben after checking the flow. Both controls and account suspension are audited. Unverified accounts cannot be manually activated. Suspensions revoke sessions. No interface enables a chargeable tariff transition; explicit future agreement and billing integration required.

## Validation

`node server/ai-policy.test.js`; embedded PostgreSQL and DOM workflow tests: `npm install --prefix server/ai-tests` then `node server/ai-tests/integration.mjs`. Test dependencies are isolated from production package. Includes migrations, account boundaries, commission, stock receipt idempotency, cancellation, admin restrictions, mail-token consumption, password reset and DOM login/stock/catalog/order flow. No actual SMTP sends or live card payments in tests. `node server/ai-tests/database-separation.mjs` additionally tests independent source/target databases, migration, legacy write blocking, POS isolation and sequence continuity.

## Remaining

Recipe consumption, POS/API adapters, weather/events forecasting, CSV product imports, advanced shop design/reporting, partial receipts/returns, payment settlement, commission invoices and subscription collection. Lists currently cap stock/products at 1,000, catalog/admin/orders at 200; stock ledger shows latest 100 moves, admin audit latest 50. Browser visual review blocked by unavailable Chromium download; DOM interactions tested.

## Shared privacy information

Both products link to `/datenschutz`. The existing page is still an explicit lawyer-review placeholder, not a completed privacy notice. A final common text must cover both products before public launch. Reusing the notice does not merge account, stock or order data.

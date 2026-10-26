# Shop payment continuation

Development source: current main a3714bab9ea60645e1dd3e85a7b9f94d3d208810.
This collection adds an opt-in TEST payment router, authenticated payment-session
services, and a dedicated customer payment page. It does not replace current root
files with the historical reconstruction.

Routes: GET /api/v1/shop/payment-sessions/:checkoutId and explicit same-origin
POST /start or /refresh with an empty JSON object. Requests are owner/admin and
company scoped. Starting additionally requires the original preparing session.
The existing dispatch transaction commits uncertainty before provider transport;
repeated open requests reuse their existing checkout. Uncertain submissions must
not be retried automatically. GET never calls the provider.

The page at /shop/payment.html#CHECKOUT_UUID loads explicitly, shows original
net/VAT/gross amounts, prepares TEST checkout and exposes its verified Mollie
link. Refresh explicitly fetches provider state. Private views clear when hidden,
offline or the account changes; no payment data is saved in browser storage.

Current startup now constructs both download/consent and payment routers only
when SHOP_TEST_PAYMENTS_ENABLED=true in POS mode. It requires the server-side
MOLLIE_TEST_API_KEY and SHOP_SELLER_PROFILE JSON (name, street, postalCode, city,
taxId, country DE). No secret values are added to source or logs. Ordinary shop
migrations run before download/consent and payment migrations. Missing configuration
keeps both optional routers closed. No deployment or configuration was changed.
Existing checkout/read APIs retain their original capability contract. Preparation
links to the dedicated TEST page. Windows consent displays seller, buyer and
immutable amounts, with an unchecked checkbox and explicit digest-bound acceptance.

Deferred at owner request: functional, browser, PostgreSQL concurrency and actual
provider acceptance. Only syntax checks are performed in this collection.
Still required for full completion: real final invoice archival/delivery, monthly recurring
fulfilment, licence issuance and reviewed installer delivery. This is a code
checkpoint, not a finished shop or live-release claim.

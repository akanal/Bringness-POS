# QR service models: trial

Each restaurant selects exactly one QR service model under POS settings: restaurant (table service, default) or pickup (counter collection). This is separate from the existing restaurant/counter cash-register profile and does not change prices or licenses. Open QR orders, including prepaid pickup orders that are not ready, prevent switching models.

Orders appear oldest first as intact table tickets. Each later order is a separate ticket at its own place in the queue. No extra confirmation/preparing steps are required. Pickup uses one Abholbereit action in the POS board or the assigned waiter's counter panel. This sets an idempotent collection timestamp without changing payments, receipt records or financial order status.

Guest ordering remains available after submission. The previous browser-side lock and forced navigation away from the table code are removed. Existing retry request IDs remain idempotent. No new photographed-QR protection is enabled; that decision is pending.

The guest page tracks only its own order IDs plus random request IDs in sessionStorage, polls every four seconds while visible, and displays the collection message. Existing page interaction unlocks audio where supported; vibration is attempted where supported. There is no Notification permission request, app installation or background push. Alerts while the phone is locked are not guaranteed.

Validation: node --test server/qr-service.test.js (8 passing tests), plus syntax checks. API tests use an injected database double; PostgreSQL migration and real-device/browser verification remain pending. Test both models, two successive guest orders, concurrent model change/order submission, assigned/unassigned waiter access, ready action twice, prepayment then ready, and Android/iPhone sound behavior.

Netcup: rebuild and replace the POS container using the updated repository and APP_MODE=pos. The existing container has manually removed AI imports; its replacement must use this environment setting. Startup adds the model/timestamp columns; existing orders default to restaurant mode. Keep the current container and backup until the live tests pass. Publication in GitHub alone does not update Netcup.

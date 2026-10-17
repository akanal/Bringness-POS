# Module booking and display control, 17 October 2026

Active addon cards are grouped under **Meine Module**, with status, price and cancellation controls. They are absent from the available addon groups. Public offers remain visible. Display control is `display_control_monthly`, EUR 14.99 net monthly for either base licence; no tables required. Existing restaurant contracts retain display access. Screens, tokens, media and paid customer contracts are preserved.

The server creates a durable checkout reservation before calling the payment provider. A company row lock serializes competing requests, and a partial unique index permits only one unresolved reservation per company/module (one shared slot for the base products). Approval consumption and the reservation commit together. A second browser/device, old outstanding checkout, active licence, or canceled licence with remaining paid time cannot start a second payment. Provider customer/payment calls carry reservation-based idempotency keys.

Only a verified terminal provider notification resolves a linked reservation, in the same transaction as billing updates. Timeouts, lost replies and restarts never automatically release it. A reservation without a recorded provider payment requires operator reconciliation against the provider before release; do not delete or expire it to force a new payment. This deliberately favors preventing duplicate charges over silently retrying an ambiguous request. Existing customer contracts are not migrated.

Display editor, player and assigned media require active display rights plus a base licence; legacy restaurant rights remain valid. Expiry stops public player refresh/media access; a received 403 clears already displayed content. Network outages preserve the existing last-content behavior. Previously cached/downloaded images cannot be remotely erased.

Validation uses synthetic data only: PostgreSQL-backed reservation constraints, atomic approval rollback, legacy pending payment, cancellation/grace, tenant isolation, eight simultaneous requests and the actual checkout route with a stub provider (one payment), public/POS card rendering, display editor/player/media expiry, online/download/legacy access and existing unit/integration suites. No real customer payment is used for validation.

## Owner address verification repair — 17 October 2026

The licensing screen now shows the actual owner-email confirmation status and an explicit request button. The module selection button says that an approval email is being requested; it never claims Mollie is opening at that stage. A missing/unverified address fails closed in both the UI and the server.

`owner_email_verifications` stores normalized owner-email binding, a hashed 30-minute verification token and an explicit verification time. Only the authenticated owner with the existing administrative unlock may request the email. An email GET never verifies the address: the owner must explicitly confirm through POST. Address changes invalidate the verification and all old purchase approvals. Existing users are not silently marked verified. Each individual module purchase still requires its own product/price-bound one-use approval, followed by verified provider payment. Ordinary POS sales and base-product checkouts retain their existing behavior.

The transactional mail worker rechecks current ownership, current email binding, expiry, verification state and token validity immediately before submitting these emails. Stale/used/changed-address mail is suppressed; SMTP acceptance is not claimed as inbox delivery.

Validation: module-approval database suite covers initial refusal, explicit address verification, single-use tokens, owner/PIN, queued encrypted mail, fake SMTP acceptance, old-address suppression, product/price binding and approval consumption. The actual licensing/confirmation clients are tested with JSDOM to verify zero checkout requests before approval and no POST merely on opening a verification link. Full local unit suite: 507 passed. No real module purchase or customer payment was used in validation.

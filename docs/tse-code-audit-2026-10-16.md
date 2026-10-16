# TSE code audit – 2026-10-16

Read-only inspection of main branch:
- server/start.js imports and routes tse-integration.js, fiskaly-test.js, public-receipt.js.
- server/tse-integration.js creates receipt insert trigger, snapshots line items/payments/VAT and inserts prepared transaction.
- server/fiskaly-test.js has authenticated test credential setup and explicit TEST mode.
- server/public-receipt.js generates a public receipt token and receipt URL.
- db/schema.sql contains receipts.fiscal_status, but runtime migrations extend the schema.

Follow-up checks before changing behavior:
1. Inspect server/tse-core.js, tse-signing-worker.js, tse-swissbit.js and fiskaly-sandbox.js for actual signing capabilities and error handling.
2. Trace payment finalization through receipt insertion and public receipt rendering; confirm no unsigned transaction is misrepresented as signed.
3. Test transaction idempotency and recovery after signing/provider failure.
4. Confirm deployed environment/provider configuration independently; source code alone does not prove compliance.
5. Validate German fiscal export and receipt requirements before production rollout.

No runtime code or live configuration changed in this audit.

# Bringness POS – TSE integration checklist

Status: preparation only. No fiscal provider is connected by this document.

## Acceptance gates
- Confirm the legal entity, certified TSE provider, credentials, and production/test separation.
- Record a stable transaction identifier and immutable fiscal event log before payment is acknowledged.
- Support start, update, finish, cancellation and recovery without duplicate fiscalization (idempotency keys).
- Persist provider signature, transaction number, TSE serial, signature counter, timestamps and error states.
- Generate legally required receipt fields from actual signed provider data; never simulate a TSE signature or QR payload.
- Block or clearly flag fiscal failures according to verified German legal/provider requirements; audit offline recovery.
- Keep cloud TSE and hardware/SD-card TSE adapters separate; verify device and certification requirements.
- Test sale, refund, cancellation, split payments, outages, retries, duplicate requests, and receipt scanning.
- Verify DSFinV-K export and audit/retention processes with tax adviser before production activation.
- Do not deploy until integration tests and fiscal compliance review pass.

## Rollout
1. Inspect actual checkout, receipt, database and deployment modules.
2. Implement a provider-neutral adapter and persistence migration in an isolated branch.
3. Wire certified provider sandbox and run automated end-to-end tests.
4. Review receipts and export, then approve controlled production rollout.

This file is a planning checklist, not evidence of compliance.

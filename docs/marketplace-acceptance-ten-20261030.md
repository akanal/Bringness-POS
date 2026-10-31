# Merchant/payment acceptance: ten-point completion

Builds on PR181, reuses PR185 and includes PR184 durable OAuth claims and stale-cookie protection. Owner authorized verified code deployment on 30 October. No real seller acceptance or financial transaction is manufactured.

| Point | Implemented or preserved | Remaining external condition |
|---|---|---|
| 1 Code and checks | Compare main, PR181, PR184 and PR185; combine newer consent fixes with test host | Final CI outcomes recorded in release PR |
| 2 Productive prerequisites | Explicit fixed blockers for real merchant acceptance, productive accounting and fulfilment | Real operator/provider acceptance remains required |
| 3 Merchant/restaurant/profile | Owner/admin session scopes seller company; provider organization/profile verified; readiness now rejects a status without complete test identity | Operator must match the actual legal merchant/restaurant to the approved account; no guess from business name |
| 4 Test/live separation | Explicit test host opt-in, OAuth-only credentials, verified test responses, AI/isolated gates, no platform key fallback | Protected host configuration and actual merchant consent |
| 5 Addresses/webhook | Exact HTTPS callback/return/webhook comparison, fixed paths, notification IDs are lookup hints only | Provider dashboard registration must be checked by its authorized operator |
| 6 Release reasons | Private report with fixed codes; UI rejects incomplete, inconsistent or forged-success reports | No browser flag can authorize production |
| 7 Merchant acceptance | Ordered operator checklist below; no synthetic evidence represented as real acceptance | Authorized merchant/operator must perform real acceptance |
| 8 Reconciliation/accounting | Existing durable bounded recovery/backoff; private rows now explicitly show test_not_booked, provider reference and test handoff state | Productive accounting/refunds and fiscal mapping remain unaccepted and disabled |
| 9 Single handoff | Existing immutable unique order handoff, transaction and provider proof; private report exposes confirmed_test_only only for matching seller/order record | Test handoff never releases real goods |
| 10 Failure/concurrency | Dedicated database, UI, payment and PostgreSQL/native browser CI; late OAuth callbacks/restarts/parallel writes preserved | Final CI results and deployment evidence recorded separately |

## Actual merchant acceptance checklist

1. Authorized owner/admin confirms the legal merchant and restaurant belong to the approved seller company. Never infer identity from a matching display name.
2. Operator configures the dedicated OAuth application, stable encryption key and exact HTTPS addresses in protected configuration. Do not paste credentials into chat or reports.
3. Merchant grants OAuth consent; independently compare the provider organization and verified profile to the intended business. A readiness status is not that human/legal acceptance.
4. Start an explicit TEST order only; verify stored seller, buyer, order, immutable EUR amount, original connection revision and provider reference.
5. Exercise return without trusting URL claims, repeated webhook, lost reply and GET-only recovery. Confirm one provider creation and one immutable test handoff.
6. Disconnect or supersede consent during delayed provider response; confirm no credential resurrection. Retest parallel checkout/reconciliation under PostgreSQL.
7. Confirm test_not_booked and can_fulfil=false. No revenue, licence, kitchen, shipping or fiscal release may follow a test payment.
8. Productive accounting, refunds, merchant/provider approval and actual goods release require separately implemented and accepted production integration. This package cannot authorize them.

## Deployment scope

Deploy code only after applicable CI and pre-release backup pass. Retain existing secret configuration, runtime flags and prior container. Test checkout remains opt-in; never create credentials, seller fixtures or transactions on production. Verify public static bytes and document service availability after release. Production payment readiness remains false.

# Bringness AI workspace expansion

## Languages

A header language selector offers German, English and Turkish. The preference is saved locally, with supported browser language as the initial choice. Known navigation, form labels and workflow text are translated locally; account data, product names, recipe names and editable values are preserved. Untranslated copy falls back to German. No external translation API is called. Product language metadata and UI language are independent.

## Supplier shop

The product list can be searched without editing products. Net pack prices show an indicative 2% commission per pack (actual commission is rounded on the complete order). Delivery area, delivery terms and minimum order value remain editable through the supplier profile and are linked from the dashboard. The dashboard shows outstanding commission with a direct link to the supplier commission account.

## Purchase planning

Restaurants can choose 1–30 forecast days. The target is the greater of minimum stock and average net recipe consumption over the previous 28 days times the horizon. Accepted, unreceived orders are deducted; merely sent orders are not deducted. Negative inventory increases shortage. Net consumption includes reversals and is clamped to zero. Matching offers require the same unit and exact case-insensitive product name. Whole packs, minimum packs and supplier minimum order value are considered. The user must review packaging, supplier identity, delivery area and date. Suggestions never place orders automatically. This is a consumption-based estimate; no weather or event integration is claimed.

## Commission account

Suppliers pay 2% of net goods value on Bringness-referred orders, including both launch shop plans. Sent/accepted orders are pending; received orders are outstanding; cancelled orders have zero commission. Supplier totals cover all orders; the detail list shows the latest 1000. The platform administrator can view received-order commissions and record a full payment against one order with a mandatory evidence reference. Suppliers cannot mark commissions as paid. Repeated settlement records do not duplicate payment or audit entries. The snapshot commission amount is used, not a recalculated current product price.

These records are payment tracking, not invoices or bank/PSP payment execution. Automatic collection, fiscal invoicing, payment credentials, due dates and reminders are not configured by this change. Partial payments and payment reversals need a later accounting workflow.

## Validation

Embedded PostgreSQL and browser DOM tests cover tenant isolation, pack rounding, accepted deliveries, consumption estimates, supplier minimum order value, 2% calculations, payment authorization, settlement retry idempotency, product filtering, persistent language switching and preservation of original product names. Existing CSV, account, barcode, recipe, stock and order workflows continue to pass. Database-separation and policy checks also pass.

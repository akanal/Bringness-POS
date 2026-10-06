# Bringness AI: approved pricing, 30 September 2026

Introduction has no scheduled end. Restaurant Premium: EUR 0/month/location. Supplier Basic and Pro: EUR 0/month, 200 basis points commission on mediated net goods value after refunds and cancellations, paid by supplier.

Standard terms after introduction: Restaurant Basis free, Premium EUR 29/month/location; supplier Basic EUR 0/month + 800 bps, Pro EUR 49/month + 200 bps. Monthly subscriptions cancellable monthly. Advertising, enterprise and custom API integrations individually quoted. Prices exclude applicable VAT. Standard Premium trial: 30 days after setup, no automatic paid activation. Introduction supersedes the 30-day standard trial while active.

Transition requires advance notice and explicit agreement. No arbitrary restaurant-count threshold or automatic end date has been authorized. Payment processing model and fees remain undecided.

`apps/web/public/ai-pricing.json` records the terms for future AI implementation. It is not connected to POS billing or a live AI checkout. `ai.html` links to `ai-workspace.html`: separate email-verified AI accounts, profiles, stock, supplier catalog, single-product orders and full stock receipt. PostgreSQL order records snapshot 200 bps commission; cancellations zero the accrued amount. No payment processing, invoice issuance or collection is implemented. Forecasting, recipes, POS adapters, partial delivery/returns and automated subscription billing remain to be implemented. Do not reuse POS subscription plans for these offers.

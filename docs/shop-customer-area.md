# Customer area continuation — 2026-10-26

New my-shop.html is an explicit navigation overview with cards for existing order history, licences, Windows history, seller drafts, login and help. Its three selection counts read only the current tab's existing cart/saved/compare storage, validate bounded values and show an unavailable state rather than invented zeros when corrupt or blocked. No token decoding, authenticated requests, account verification, server statistics or new persistence. CSP connect-src none.

Explicit #cart/#saved/#compare links open existing shop dialogs without checkout requests. Direct #alle-kategorien opens the existing directory; original #review continuation remains intact. Added links in main navigation and existing account dialog. Login/registration and seller header link to the overview.

Order history, Windows history, licences and help now share the dark Bringness header/wordmark, breadcrumbs, consistent headings, responsive controls/cards and printing boundaries. Existing server authorization, actual statuses, payment gates, history/licence reads and form mounts remain unchanged. Current production HTML files were fetched before editing.

Syntax checks passed for the new overview module and changed shop entry module. Existing release workflows must pass before publication. No real credentials, orders, payments, licences or seller records were created for this work.
